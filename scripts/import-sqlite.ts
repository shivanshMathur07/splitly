// One-off: copy data from the old SQLite file (data/splitly.db) into the current Postgres
// database (DATABASE_URL / POSTGRES_URL, or the local PGlite). The target must have no users yet.
// Usage: npm run db:import-sqlite                 (reads data/splitly.db)
//        npm run db:import-sqlite -- path/to/file.db
import fs from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

// FK-safe order. Columns are read from the SQLite table, so this also works on older copies.
const TABLES = [
  "users",
  "categories",
  "groups",
  "group_members",
  "friendships",
  "expenses",
  "expense_shares",
  "activities",
  "activity_users",
  "sessions",
  "login_tokens",
  "dev_mailbox",
] as const;
const SERIAL_TABLES = ["users", "groups", "expenses", "activities", "dev_mailbox"];

async function main() {
  const file = path.resolve(process.argv[2] || process.env.DATABASE_PATH || path.join("data", "splitly.db"));
  if (!fs.existsSync(file)) throw new Error(`SQLite file not found: ${file}`);
  const { DatabaseSync } = await import("node:sqlite");
  const src = new DatabaseSync(file, { readOnly: true });
  const { closeDb, describeDb, get, run, tx } = await import("../src/lib/db");

  const existing = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))!.n;
  if (existing > 0) throw new Error(`${describeDb()} already has ${existing} user(s). Import only into an empty database (npm run db:reset -- --no-demo first).`);

  await tx(async () => {
    for (const t of TABLES) {
      const has = src.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
      if (!has) continue;
      const rows = src.prepare(`SELECT * FROM ${t}`).all() as Record<string, unknown>[];
      for (const r of rows) {
        if (t === "users" && typeof r.email === "string") r.email = r.email.toLowerCase();
        if (t === "login_tokens" && typeof r.email === "string") r.email = r.email.toLowerCase();
        const cols = Object.keys(r);
        await run(
          `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ON CONFLICT DO NOTHING`,
          ...cols.map((c) => r[c] as string | number | null),
        );
      }
      console.log(`  ${t}: ${rows.length}`);
    }
    for (const t of SERIAL_TABLES) await run(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 0) + 1, false)`);
  });
  src.close();
  console.log(`✅ Imported ${file} into ${describeDb()}`);
  await closeDb();
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
