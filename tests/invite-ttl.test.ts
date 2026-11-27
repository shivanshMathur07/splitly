import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));
vi.mock("next/navigation", () => ({ redirect: (u: string) => { throw new Error(`redirect:${u}`); }, notFound: () => { throw new Error("notFound"); } }));

import { closeDb, db, get, run } from "../src/lib/db";
import { consumeMagicLink, createMagicLink, INVITE_LINK_MINUTES, SIGN_IN_LINK_MINUTES } from "../src/lib/auth";
import * as svc from "../src/lib/services";

const T0 = new Date("2026-11-27T18:45:00Z"); // 28 Nov 2026, 00:15 IST
const at = (ms: number) => vi.setSystemTime(new Date(T0.getTime() + ms));
const MIN = 60_000;
const DAY = 86_400_000;
const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
const expiresOf = async (url: string) =>
  (await get<{ expires_at: string }>("SELECT expires_at FROM login_tokens WHERE token_hash = ?", (await import("../src/lib/auth")).sha256(tokenOf(url))))!.expires_at;

let owner = 0;
let friend = 0;

beforeAll(async () => {
  process.env.APP_URL = "http://test.local";
  await db();
  owner = (await svc.findOrCreateUser("owner@example.com", "Owner")).id;
  friend = (await svc.findOrCreateUser("friend@example.com", "Friend")).id;
});
afterEach(() => vi.useRealTimers());
afterAll(() => closeDb());

describe("magic link TTLs", () => {
  it("self sign-in links last 30 minutes, invite links 7 days", () => {
    expect(SIGN_IN_LINK_MINUTES).toBe(30);
    expect(INVITE_LINK_MINUTES).toBe(7 * 24 * 60);
  });

  it("a self sign-in link expires after 30 minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    const url = await createMagicLink("owner@example.com", "/");
    expect(await expiresOf(url)).toBe("2026-11-27 19:15:00");
    at(31 * MIN);
    expect(await consumeMagicLink(tokenOf(url))).toBeNull();
  });

  it("an invite link still works after 6 days, but only once", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    const url = await createMagicLink("friend@example.com", "/groups/1", INVITE_LINK_MINUTES);
    expect(await expiresOf(url)).toBe("2026-12-04 18:45:00");
    at(6 * DAY);
    const r = await consumeMagicLink(tokenOf(url));
    expect(r?.user.email).toBe("friend@example.com");
    expect(r?.next).toBe("/groups/1");
    expect(await consumeMagicLink(tokenOf(url))).toBeNull(); // single-use
  });

  it("an invite link is dead after 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    const url = await createMagicLink("friend@example.com", "/", INVITE_LINK_MINUTES);
    at(7 * DAY + 1000);
    expect(await consumeMagicLink(tokenOf(url))).toBeNull();
  });

  it("rejects a non-positive TTL", async () => {
    await expect(createMagicLink("x@example.com", "/", 0)).rejects.toThrow();
  });
});

describe("shareable group link expiry", () => {
  it("a new group's link works for 7 days, then expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    const id = await svc.createGroup(owner, { name: "Trip", type: "trip", currency: "INR", simplify: true });
    const g = (await svc.getGroupForUser(id, owner))!;
    expect(svc.groupInviteExpiresAt(g)).toBe("2026-12-04 18:45:00");
    at(7 * DAY - 1000);
    expect((await svc.getInvite(g.invite_token))?.expired).toBe(false);
    expect((await svc.getGroupByInvite(g.invite_token))?.id).toBe(id);
    at(7 * DAY);
    expect((await svc.getInvite(g.invite_token))?.expired).toBe(true);
    expect(await svc.getGroupByInvite(g.invite_token)).toBeNull();
  });

  it("resetting gives a new token and a fresh 7 days; the old token is gone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    const id = await svc.createGroup(owner, { name: "Flat", type: "home", currency: "INR", simplify: true });
    const old = (await svc.getGroupForUser(id, owner))!.invite_token;
    at(10 * DAY);
    expect((await svc.getInvite(old))?.expired).toBe(true);
    await svc.regenerateInvite(id, owner);
    const g = (await svc.getGroupForUser(id, owner))!;
    expect(g.invite_token).not.toBe(old);
    expect(await svc.getInvite(old)).toBeNull();
    expect(svc.groupInviteExpiresAt(g)).toBe("2026-12-14 18:45:00");
    expect((await svc.getInvite(g.invite_token))?.expired).toBe(false);
  });

  it("only members can reset", async () => {
    const id = await svc.createGroup(owner, { name: "Solo", type: "other", currency: "INR", simplify: true });
    await expect(svc.regenerateInvite(id, friend)).rejects.toThrow();
  });

  it("groups without an expiry (made by an older deployment) fall back to created_at + 7 days", async () => {
    const id = await svc.createGroup(owner, { name: "Legacy", type: "other", currency: "INR", simplify: true });
    await run("UPDATE groups SET invite_expires_at = NULL, created_at = ? WHERE id = ?", "2026-11-01 10:00:00", id);
    const g = (await svc.getGroupForUser(id, owner))!;
    expect(svc.groupInviteExpiresAt(g)).toBe("2026-11-08 10:00:00");
    expect(svc.isGroupInviteExpired(g, new Date("2026-11-08T09:59:59Z"))).toBe(false);
    expect(svc.isGroupInviteExpired(g, new Date("2026-11-08T10:00:00Z"))).toBe(true);
  });

  it("migration v4 backfills existing groups with 7 days from when it ran", async () => {
    const row = await get<{ n: number }>("SELECT COUNT(*) AS n FROM groups WHERE invite_expires_at IS NULL AND name <> 'Legacy'");
    expect(row!.n).toBe(0);
    const v = await get<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations");
    expect(v!.version).toBe(4);
  });

  it("unknown tokens return null", async () => {
    expect(await svc.getInvite("nope")).toBeNull();
    expect(await svc.getInvite("")).toBeNull();
  });
});
