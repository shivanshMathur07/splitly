// Postgres access layer.
//  • DATABASE_URL (or POSTGRES_URL, which Neon's Vercel integration sets) → postgres.js over TCP.
//  • Neither set (local dev / tests) → PGlite, an embedded WASM Postgres stored in data/pglite
//    (or in memory when PGLITE_DIR=memory://).
// Queries use "?" placeholders (converted to $1, $2… here) and return plain objects.
// tx() runs a callback in a transaction; every all/get/run inside it joins that transaction
// automatically (tracked with AsyncLocalStorage), so service code stays simple.
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_TREE, GENERAL_CATEGORY_ID, MIGRATIONS } from "./schema";

export type Row = Record<string, unknown>;
export type Param = string | number | boolean | null;

interface Executor {
  query(sql: string, params: Param[]): Promise<Row[]>;
}
interface Driver extends Executor {
  kind: "postgres" | "pglite";
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (ex: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Connection string for a real Postgres server, if configured. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/** Where PGlite keeps its files when no DATABASE_URL is set. */
export function pgliteDir(): string {
  const d = process.env.PGLITE_DIR || path.join("data", "pglite");
  if (d.startsWith("memory://")) return d;
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), d);
}

/** Human-readable description of the database in use (never includes the password). */
export function describeDb(): string {
  const url = databaseUrl();
  if (!url) return `PGlite (embedded Postgres) at ${pgliteDir()}`;
  try {
    const u = new URL(url);
    return `Postgres at ${u.hostname}${u.pathname}`;
  } catch {
    return "Postgres (DATABASE_URL)";
  }
}

/** "SELECT ? , ?" → "SELECT $1, $2". Our SQL never contains a literal "?". */
export function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// COUNT(*) is bigint and SUM() is numeric in Postgres; all our values fit in a JS number.
const toNum = (x: string) => Number(x);

async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: Number(process.env.PG_POOL_MAX || 3),
    idle_timeout: 20,
    connect_timeout: 15,
    prepare: false, // works with poolers in transaction mode (Neon "-pooler" hosts)
    onnotice: () => {},
    types: { num: { to: 20, from: [20, 1700], serialize: (x: unknown) => String(x), parse: toNum } },
  });
  const ex = (s: typeof sql): Executor => ({
    query: async (q, params) => Array.from(await s.unsafe(toPg(q), params as never[])) as Row[],
  });
  return {
    kind: "postgres",
    ...ex(sql),
    exec: async (q) => {
      await sql.unsafe(q);
    },
    transaction: async <T>(fn: (e: Executor) => Promise<T>) => (await sql.begin((t) => fn(ex(t as unknown as typeof sql)))) as T,
    close: () => sql.end({ timeout: 5 }),
  };
}

async function pgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (!dir.startsWith("memory://")) fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, { parsers: { 20: toNum, 1700: toNum } });
  const ex = (d: { query: typeof db.query }): Executor => ({
    query: async (q, params) => (await d.query<Row>(toPg(q), params)).rows,
  });
  return {
    kind: "pglite",
    ...ex(db),
    exec: async (q) => {
      await db.exec(q);
    },
    transaction: <T>(fn: (e: Executor) => Promise<T>) => db.transaction((t) => fn(ex(t))),
    close: () => db.close(),
  };
}

async function seedCategories(ex: Executor) {
  const [{ n }] = (await ex.query("SELECT COUNT(*) AS n FROM categories", [])) as { n: number }[];
  if (n > 0) return;
  const ins = (id: number, parent: number | null, name: string, icon: string, color: string) =>
    ex.query("INSERT INTO categories (id, parent_id, name, icon, color) VALUES (?, ?, ?, ?, ?)", [id, parent, name, icon, color]);
  await ins(GENERAL_CATEGORY_ID, null, "General", "🧮", "#64748b");
  let id = 10;
  for (const parent of CATEGORY_TREE) {
    const pid = id++;
    await ins(pid, null, parent.name, parent.icon, parent.color);
    for (const [name, icon] of parent.children) await ins(id++, pid, name, icon, parent.color);
    id = Math.ceil(id / 10) * 10;
  }
}

/** Apply pending migrations (idempotent; safe if several cold starts race, thanks to an advisory lock). */
export async function migrate(d: Driver): Promise<number[]> {
  await d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await d.query("SELECT version FROM schema_migrations", [])).map((r) => Number(r.version)));
  const pending = MIGRATIONS.filter((m) => !done.has(m.version));
  const applied: number[] = [];
  if (pending.length) {
    await d.transaction(async (ex) => {
      await ex.query("SELECT pg_advisory_xact_lock(724501)", []);
      const now = new Set((await ex.query("SELECT version FROM schema_migrations", [])).map((r) => Number(r.version)));
      for (const m of pending) {
        if (now.has(m.version)) continue;
        // multi-statement SQL can't take parameters, so run each statement on its own
        for (const stmt of splitSql(m.sql)) await ex.query(stmt, []);
        await ex.query("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", [m.version, m.name]);
        applied.push(m.version);
      }
      await seedCategories(ex);
    });
  }
  return applied;
}

/** Split a migration into statements on ";" at line ends, keeping $$-quoted bodies intact. */
function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inDollar = false;
  for (const line of sql.split("\n")) {
    if (/^\s*--/.test(line) && !inDollar) continue;
    cur += line + "\n";
    if ((line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*(--.*)?$/.test(line)) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export async function openDb(): Promise<Driver> {
  const url = databaseUrl();
  if (!url && process.env.VERCEL)
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL) is not set. On Vercel, add the Neon integration (Storage → Neon) or set DATABASE_URL in Project → Settings → Environment Variables.",
    );
  const d = url ? await postgresDriver(url) : await pgliteDriver(pgliteDir());
  await migrate(d);
  return d;
}

const g = globalThis as unknown as { __splitlyDb?: Promise<Driver> };

/** Shared driver (cached on globalThis so dev hot-reload doesn't open the database twice). */
export function db(): Promise<Driver> {
  if (!g.__splitlyDb) {
    g.__splitlyDb = openDb();
    g.__splitlyDb.catch(() => (g.__splitlyDb = undefined)); // retry on the next request after a failure
  }
  return g.__splitlyDb;
}

/** Close the shared connection (used by scripts and tests). */
export async function closeDb() {
  const p = g.__splitlyDb;
  g.__splitlyDb = undefined;
  if (p) await (await p).close();
}

const txStore = new AsyncLocalStorage<Executor>();
const executor = async (): Promise<Executor> => txStore.getStore() ?? (await db());

export async function all<T = Row>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await (await executor()).query(sql, params)) as T[];
}
export async function get<T = Row>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await all<T>(sql, ...params))[0];
}
export async function run(sql: string, ...params: Param[]): Promise<void> {
  await (await executor()).query(sql, params);
}
/** INSERT … and return the new row's id. */
export async function insert(sql: string, ...params: Param[]): Promise<number> {
  const rows = await all<{ id: number }>(`${sql} RETURNING id`, ...params);
  return Number(rows[0].id);
}

/** Run fn inside a transaction. Nested calls join the outer transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const d = await db();
  return d.transaction((ex) => txStore.run(ex, fn));
}
