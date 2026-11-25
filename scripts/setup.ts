// Creates/migrates the database (schema + categories) and, if it is empty, adds demo data.
// Uses DATABASE_URL / POSTGRES_URL if set, otherwise the embedded PGlite database in data/pglite.
// Usage: npm run setup            -> migrate, add demo data if no users exist
//        npm run setup -- --no-demo
//        npm run seed -- --email you@example.com   (force demo data, owner = your email)
//        npm run db:reset         -> wipe the database and run setup again
//                                    (on a remote DATABASE_URL this also needs --force)
import fs from "node:fs";

// Load .env.local / .env like Next.js does, so the database settings match the app.
// (db() is lazy, so this runs before any connection is opened.)
for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

// Every table the app creates (dropped by --reset on a remote database).
const APP_TABLES = [
  "activity_users", "activities", "expense_shares", "expenses", "categories", "group_members", "groups",
  "friendships", "login_tokens", "sessions", "users", "dev_mailbox", "rate_events", "schema_migrations",
];

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;

async function main() {
  // imported after .env is loaded
  const { closeDb, databaseUrl, db, describeDb, get, pgliteDir } = await import("../src/lib/db");
  const { seedDemo } = await import("./seed-data");
  const where = describeDb();

  if (flag("--reset")) {
    if (databaseUrl()) {
      if (!flag("--force")) {
        console.error(`❌ Refusing to wipe ${where} without --force (run: npm run db:reset -- --force).`);
        process.exit(1);
      }
      const d = await db();
      await d.exec(
        `DROP TABLE IF EXISTS ${APP_TABLES.join(", ")} CASCADE; DROP FUNCTION IF EXISTS utc_now() CASCADE;`,
      );
      await closeDb();
      console.log(`🗑️  Wiped all tables in ${where}`);
    } else {
      const dir = pgliteDir();
      if (!dir.startsWith("memory://") && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      console.log(`🗑️  Removed ${dir}`);
    }
  }

  await db(); // connects and applies migrations
  console.log(`✅ Database ready: ${where}`);
  const users = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))!.n;

  if (flag("--seed") || (!flag("--no-demo") && users === 0)) {
    const r = await seedDemo(email);
    console.log(`🌱 Demo data added. Sign in as ${r.ownerEmail} (or asha@ / rahul@ / meera@example.com) via the dev mailbox.`);
  } else if (users > 0) {
    console.log(`ℹ️  ${users} user(s) already exist — skipping demo data (use "npm run seed" to add it anyway).`);
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  if (String(e).includes("lock") || String(e).includes("Aborted"))
    console.error("Is `npm run dev` running? Stop it first — the embedded database can only be opened by one process at a time.");
  process.exit(1);
});
