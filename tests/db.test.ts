import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
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
    const n = await svc.settleWithFriend(1, 2, "INR");
    expect(n).toBeGreaterThan(0);
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
