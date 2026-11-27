import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { all, closeDb, db, get, run, toPg, tx } from "../src/lib/db";
import { hitRateLimit } from "../src/lib/rate-limit";
import * as svc from "../src/lib/services";
import { seedDemo } from "../scripts/seed-data";

let goa = 0;
let flat = 0;

beforeAll(async () => {
  const d = await db();
  expect(d.kind).toBe("pglite");
  const r = await seedDemo();
  [goa, flat] = r.groups;
});
afterAll(() => closeDb());

describe("db layer", () => {
  it("converts ? placeholders to $n", () => {
    expect(toPg("SELECT ? , ? FROM t WHERE a IN (?)")).toBe("SELECT $1 , $2 FROM t WHERE a IN ($3)");
  });

  it("applies every migration once and seeds categories", async () => {
    const versions = await all<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version");
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect((await get<{ n: number }>("SELECT COUNT(*) AS n FROM categories"))!.n).toBe(33);
  });

  it("returns COUNT(*) as a JS number", async () => {
    const r = await get<{ n: unknown }>("SELECT COUNT(*) AS n FROM users");
    expect(typeof r!.n).toBe("number");
  });

  it("rolls back a failed transaction", async () => {
    await expect(
      tx(async () => {
        await run("INSERT INTO users (email, name) VALUES (?, ?)", "rollback@example.com", "Temp");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await get("SELECT id FROM users WHERE email = ?", "rollback@example.com")).toBeUndefined();
  });

  it("stores timestamps in the SQLite-compatible UTC text format", async () => {
    const u = await get<{ created_at: string }>("SELECT created_at FROM users ORDER BY id LIMIT 1");
    expect(u!.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("services on Postgres (demo data)", () => {
  it("creates the demo groups and members", async () => {
    const groups = await svc.listGroups(1);
    expect(groups.map((g) => [g.name, g.member_count]).sort()).toEqual([
      ["Flat 302", 2],
      ["Goa trip", 4],
    ]);
  });

  it("keeps balances zero-sum per currency and simplifies to n-1 transfers at most", async () => {
    for (const b of await svc.groupBalances(goa)) {
      expect(Object.values(b.net).reduce((a, v) => a + v, 0)).toBe(0);
      expect(b.simplified.length).toBeLessThanOrEqual(Object.keys(b.net).length - 1);
    }
  });

  it("settling with a friend zeroes the balance", async () => {
    const before = (await svc.friendBalances(1)).get(2); // Asha
    expect(before?.INR).toBeTruthy();
    const ids = await svc.settleWithFriend(1, 2, "INR");
    expect(ids.length).toBeGreaterThan(0);
    expect((await svc.friendBalances(1)).get(2)?.INR ?? 0).toBe(0);
  });

  it("insights total matches the sum of non-payment expenses", async () => {
    const ins = await svc.getInsights(1, { groupId: flat, currency: "INR" });
    expect(ins.total).toBe(3 * 3600000 + 284733 + 99900);
    expect(ins.byCategory.reduce((a, c) => a + c.total, 0)).toBe(ins.total);
  });

  it("filters activity by group", async () => {
    const a = await svc.listActivity(1, { groupId: flat, limit: 100 });
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.group_id === flat)).toBe(true);
  });
});

describe("rate limit", () => {
  it("allows max hits per window, then blocks", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit("test", "k1", { max: 3, windowSeconds: 60 }));
    expect(results).toEqual([false, false, false, true]);
    expect(await hitRateLimit("test", "other", { max: 3, windowSeconds: 60 })).toBe(false);
  });
});

describe("UPI profile + payment emails", () => {
  it("saves a valid UPI ID (normalized) and rejects a bad one", async () => {
    await svc.updateProfile(2, "Asha", "INR", { id: "  Asha@OkAxis ", name: "Asha R" });
    expect((await svc.upiProfiles([2])).get(2)).toEqual({ id: 2, upi_id: "asha@okaxis", upi_name: "Asha R" });
    await expect(svc.updateProfile(2, "Asha", "INR", { id: "asha", name: "" })).rejects.toThrow("doesn't look like a UPI ID");
    await svc.updateProfile(2, "Asha", "INR", { id: "", name: "" });
    expect((await svc.upiProfiles([2])).get(2)?.upi_id).toBeNull();
  });

  it("stores the payment method and emails the recipient", async () => {
    const { notifyPayments } = await import("../src/lib/payment-mail");
    const id = await svc.recordPayment(1, { groupId: goa, from: 1, to: 2, amount: 12345, currency: "INR", note: "UPI ref 123", method: "upi" });
    expect((await get<{ payment_method: string }>("SELECT payment_method FROM expenses WHERE id = ?", id))!.payment_method).toBe("upi");
    const sent: { to: string; subject: string; text: string }[] = [];
    const n = await notifyPayments([id], { actorId: 1, appBase: "https://splitly.test", send: async (m) => void sent.push(m) });
    expect(n).toBe(1);
    expect(sent[0]!.to).toBe("asha@example.com");
    expect(sent[0]!.subject).toBe("Shivansh paid you ₹123.45");
    expect(sent[0]!.text).toContain("Goa trip");
    expect(sent[0]!.text).toContain("UPI ref 123");
    expect(sent[0]!.text).toContain(`https://splitly.test/groups/${goa}`);
  });

  it("defaults to manual, skips emailing the person who recorded it, and never throws on mail failure", async () => {
    const { notifyPayments } = await import("../src/lib/payment-mail");
    const id = await svc.recordPayment(1, { groupId: goa, from: 3, to: 1, amount: 500, currency: "INR" });
    expect((await get<{ payment_method: string }>("SELECT payment_method FROM expenses WHERE id = ?", id))!.payment_method).toBe("manual");
    expect(await notifyPayments([id], { actorId: 1, appBase: "x", send: async () => { throw new Error("should not send to actor"); } })).toBe(0);
    const id2 = await svc.recordPayment(1, { groupId: goa, from: 1, to: 3, amount: 700, currency: "INR" });
    await expect(notifyPayments([id2], { actorId: 1, appBase: "x", send: async () => { throw new Error("SMTP down"); } })).resolves.toBe(0);
  });

  it("settling with a friend records UPI payments and sends one combined email", async () => {
    const { notifyPayments } = await import("../src/lib/payment-mail");
    // Asha "pays" Shivansh in two groups, so Shivansh ends up owing Asha in both.
    await svc.recordPayment(1, { groupId: goa, from: 2, to: 1, amount: 4000000, currency: "INR" });
    await svc.recordPayment(1, { groupId: flat, from: 2, to: 1, amount: 9000000, currency: "INR" });
    expect((await svc.friendBalances(1)).get(2)!.INR).toBeLessThan(0);
    const ids = await svc.settleWithFriend(1, 2, "INR", "upi");
    expect(ids.length).toBe(2);
    expect((await svc.friendBalances(1)).get(2)?.INR ?? 0).toBe(0);
    const sent: { to: string; subject: string; text: string }[] = [];
    expect(await notifyPayments(ids, { actorId: 1, appBase: "https://s.test", send: async (m) => void sent.push(m) })).toBe(1);
    expect(sent[0]!.to).toBe("asha@example.com");
    expect(sent[0]!.text).toContain("paid via UPI");
    expect(sent[0]!.text).toContain("https://s.test/friends/1");
  });
});

describe("India-time defaults", () => {
  it("a payment recorded at 00:15 IST is dated that IST day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T18:45:00Z"));
    try {
      const id = await svc.recordPayment(1, { groupId: goa, from: 1, to: 3, amount: 100, currency: "INR" });
      expect((await get<{ date: string }>("SELECT date FROM expenses WHERE id = ?", id))!.date).toBe("2026-11-28");
    } finally {
      vi.useRealTimers();
    }
  });
});
