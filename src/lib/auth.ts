import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { get, run } from "./db";
import { hitRateLimit } from "./rate-limit";

export const SESSION_COOKIE = "splitly_session";
const SESSION_DAYS = 30;
/** Self sign-in links: 30 minutes. */
export const SIGN_IN_LINK_MINUTES = 30;
/** Links emailed to someone you invite (friend or group): 7 days. */
export const INVITE_LINK_MINUTES = 7 * 24 * 60;

export interface User {
  id: number;
  email: string;
  name: string | null;
  default_currency: string;
  joined_at: string | null;
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const sqlTime = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

/**
 * Base URL for links in emails and auth redirects, without a trailing slash:
 *  1. APP_URL (set this to your custom domain if you have one)
 *  2. On Vercel production: https://$VERCEL_PROJECT_PRODUCTION_URL (the stable *.vercel.app / domain,
 *     which isn't behind Vercel's deployment protection like per-deployment URLs are)
 *  3. On Vercel: https://$VERCEL_URL
 *  4. Otherwise (local dev): the current request's host.
 */
export function configuredAppUrl(): string | null {
  const strip = (u: string) => u.replace(/\/+$/, "");
  if (process.env.APP_URL) return strip(process.env.APP_URL);
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${strip(process.env.VERCEL_PROJECT_PRODUCTION_URL)}`;
  if (process.env.VERCEL_URL) return `https://${strip(process.env.VERCEL_URL)}`;
  return null;
}

export async function appUrl(): Promise<string> {
  const configured = configuredAppUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Client IP as seen by the platform proxy (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

/**
 * Throttle magic-link emails. Limits are per target email and per client IP, stored in
 * Postgres (serverless instances share no memory). Returns an error message, or null if OK.
 */
export async function checkLoginRateLimit(email: string): Promise<string | null> {
  const ip = await clientIp();
  if (await hitRateLimit("login:email", email.trim().toLowerCase(), { max: 5, windowSeconds: 15 * 60 }))
    return "Too many sign-in links were requested for this email. Please wait 15 minutes and try again.";
  if (await hitRateLimit("login:ip", ip, { max: 20, windowSeconds: 60 * 60 }))
    return "Too many sign-in requests from your network. Please try again in an hour.";
  return null;
}

/** Only allow relative in-app redirect targets. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/** Single-use sign-in link. `ttlMinutes` defaults to the 30-minute self sign-in window. */
export async function createMagicLink(email: string, next?: string, ttlMinutes: number = SIGN_IN_LINK_MINUTES): Promise<string> {
  if (!(ttlMinutes > 0)) throw new Error("ttlMinutes must be positive");
  const token = randomToken();
  await run(
    "INSERT INTO login_tokens (token_hash, email, next_path, expires_at) VALUES (?, ?, ?, ?)",
    sha256(token),
    email.trim().toLowerCase(),
    safeNext(next),
    sqlTime(new Date(Date.now() + ttlMinutes * 60_000)),
  );
  const url = new URL("/auth/verify", await appUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

/** Consume a magic-link token. Returns the user and where to go next, or null if invalid/expired/used. */
export async function consumeMagicLink(token: string): Promise<{ user: User; next: string } | null> {
  const row = await get<{ email: string; next_path: string | null; expires_at: string; used_at: string | null }>(
    "SELECT email, next_path, expires_at, used_at FROM login_tokens WHERE token_hash = ?",
    sha256(token),
  );
  if (!row || row.used_at || row.expires_at < sqlTime(new Date())) return null;
  // single-use: only the request that flips used_at from NULL wins (guards against double-clicks/races)
  const claimed = await get("UPDATE login_tokens SET used_at = utc_now() WHERE token_hash = ? AND used_at IS NULL RETURNING token_hash", sha256(token));
  if (!claimed) return null;
  await run("INSERT INTO users (email, joined_at) VALUES (?, utc_now()) ON CONFLICT (email) DO NOTHING", row.email);
  let user = (await get<User>("SELECT * FROM users WHERE email = ?", row.email))!;
  if (!user.joined_at) {
    await run("UPDATE users SET joined_at = utc_now() WHERE id = ?", user.id);
    user = (await get<User>("SELECT * FROM users WHERE id = ?", user.id))!;
  }
  return { user, next: safeNext(row.next_path) };
}

export async function createSession(userId: number): Promise<{ value: string; expires: Date }> {
  const value = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", sha256(value), userId, sqlTime(expires));
  return { value, expires };
}

export async function getCurrentUser(): Promise<User | null> {
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!c) return null;
  const user = await get<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > utc_now()`,
    sha256(c),
  );
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (!u.name) redirect("/welcome");
  return u;
}

export async function destroySession() {
  const jar = await cookies();
  const c = jar.get(SESSION_COOKIE)?.value;
  if (c) await run("DELETE FROM sessions WHERE id = ?", sha256(c));
  jar.delete(SESSION_COOKIE);
}
