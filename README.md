# Splitly

A personal expense-splitting web app: groups, friends, fair splits to the last paisa, "simplify debts" settle-up, and spending charts. Runs on Postgres: [Neon](https://neon.tech) when hosted on Vercel, and an embedded Postgres (PGlite) on your machine, so local dev still needs no database server.

> Built from my own feature notes on how expense-splitting apps behave. All code, names and icons here are original.

---

## Quick start (Windows PowerShell, macOS or Linux)

Requires **Node.js 22.13+** (tested on Node 24 / npm 11). No native build tools and no database server needed.

```powershell
cd C:\Users\shiva\Documents\code\splitwise-clone
npm install
npm run setup      # creates the local database in data\pglite and loads demo data
npm run dev        # http://localhost:3000
```

Then:

1. Open http://localhost:3000 → **Get started** → enter an email (try `shivansh@example.com` to see the demo data).
2. Click **📬 Dev mailbox** in the header (or http://localhost:3000/dev/mailbox) and click the sign-in link. The link is also printed in the terminal.
3. You're in. Invite people by email: their magic links show up in the same dev mailbox, so you can open them in a private window to act as that person.

> The local database is **PGlite**, a real Postgres compiled to WebAssembly, stored in `data/pglite`. Only one process can open it at a time, so **stop `npm run dev` before running `npm run setup`, `seed`, `db:reset` or `db:import-sqlite`**. To develop against Neon or any other Postgres instead, set `DATABASE_URL` in `.env`.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 (`$env:PORT=3100; npm run dev` to change port) |
| `npm run setup` | Create/migrate the database (schema + categories) and add demo data if there are no users yet. Safe to re-run. `npm run setup -- --no-demo` skips demo data. |
| `npm run db:migrate` | Apply pending migrations only (same as `setup -- --no-demo`) |
| `npm run seed -- --email you@example.com` | Add the demo groups with *you* as the owner |
| `npm run db:reset` | Wipe the local database and run setup again. Against a remote `DATABASE_URL` it refuses unless you add `-- --force`. |
| `npm run db:import-sqlite` | Copy data from the old SQLite version (`data/splitly.db`, or a path you pass) into an **empty** database. Run `npm run db:reset -- --no-demo` first. |
| `npm test` | Unit tests (split rounding, debt simplification) + database tests on an in-memory PGlite |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run check` | typecheck + lint + tests |
| `npm run build` then `npm start` | Production build and server (production mode needs SMTP for sign-in emails, see below) |

Migrations also run automatically on the first request, so a fresh database works even if you skip `npm run setup` (empty, without demo data).

Demo users (all sign in through the dev mailbox): `shivansh@example.com`, `asha@example.com`, `rahul@example.com`, `meera@example.com`.

### Coming from the SQLite version?

Your old data is still in `data/splitly.db`. To bring it over (stop `npm run dev` first):

```powershell
npm run db:reset -- --no-demo
npm run db:import-sqlite
```

---

## Configuration

Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`). Everything is optional locally. `.env` is gitignored; **never put real secrets in `.env.example`**, which is committed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | unset → PGlite | Postgres connection string. Falls back to `POSTGRES_URL` (set by Neon's Vercel integration). Use Neon's pooled URL with `?sslmode=require`. |
| `PG_POOL_MAX` | `3` | Max Postgres connections per server instance |
| `PGLITE_DIR` | `data/pglite` | Local embedded-database folder (`memory://` for a throwaway DB) |
| `APP_URL` | see below | Base URL used in emailed links and auth redirects |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | unset | Real email delivery via any SMTP provider (Gmail app password, Resend, Brevo, Mailgun…). **Required in production.** |
| `MAIL_FROM` | `Splitly <no-reply@localhost>` | Sender address (for Gmail, use the same address as `SMTP_USER`) |
| `DEV_MAILBOX` | on when SMTP is unset | Outside production only: force `/dev/mailbox` on (`true`) or off (`false`) |

**Link base URL:** `APP_URL` if set; otherwise on Vercel production `https://$VERCEL_PROJECT_PRODUCTION_URL` (your stable `*.vercel.app` or custom domain), on other Vercel deployments `https://$VERCEL_URL`, and locally the request's host.

**Email behaviour:** locally with no `SMTP_HOST`, every email is printed to the server console *and* stored in the dev mailbox page. With SMTP configured, emails are sent for real and the dev mailbox is disabled (unless `DEV_MAILBOX=true`). In production (`NODE_ENV=production`) the dev mailbox is **always off** (the page returns 404) and SMTP is **required**: without it, sign-in and invite forms show "Email isn't set up on this server yet" and the server log names the missing variables.

**Rate limits** (stored in Postgres, so they work across serverless instances): 5 sign-in links per email per 15 minutes, 20 sign-in requests per IP per hour, 30 invites per user per hour.

---

## Deploying (GitHub + Vercel Hobby + Neon free tier)

1. **Push to GitHub.** Create an empty repo (no README/license/.gitignore), then from this folder:
   ```bash
   git add -A && git commit -m "Initial commit"
   git remote add origin git@github.com:<you>/splitly.git
   git push -u origin main
   ```
   Check first that `git status` doesn't list `.env`, `data/` or `rea_work/`. They're gitignored.
2. **Import into Vercel.** On vercel.com → **Add New… → Project**, import the repo. The framework is detected as Next.js; keep the default build settings (`npm run build`). Don't deploy yet, or let the first deploy fail; that's fine.
3. **Add Neon.** In the project, go to **Storage → Create Database → Neon (Serverless Postgres)**, pick the free plan and a region close to your Vercel region (e.g. Mumbai / Singapore), and connect it to the project for Production (and Preview if you like). This sets `DATABASE_URL`, `POSTGRES_URL` and friends automatically.
4. **Add the email variables** under **Settings → Environment Variables** (Production): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Optionally add `APP_URL` if you attach a custom domain.
5. **Deploy** (or **Redeploy**). Tables are created on the first request. To load demo data or import your old SQLite data into Neon, run locally with the Neon URL:
   ```powershell
   $env:DATABASE_URL="<Neon pooled connection string>"; npm run setup          # or: npm run db:import-sqlite
   Remove-Item Env:DATABASE_URL
   ```
6. Open `https://<project>.vercel.app`, request a sign-in link, and check your inbox.

Notes: Vercel's Hobby plan is for personal, non-commercial use. Neon's free tier sleeps when idle, so the first request after a while can take a second or two.

---

## Features

- **Passwordless sign-in** with email magic links (single-use, 30-minute expiry, hashed in the DB). First sign-in asks for your name and default currency.
- **Invites**
  - Invite by email from a group or the Friends page: the person is added immediately (you can split with them before they sign in) and receives a magic link that signs them in and opens the group.
  - Shareable **group invite link** (`/invite/<token>`) with a reset button. New people enter their email, get a magic link, and join.
- **Groups** (home, trip, couple, office, other) with a default currency and a per-group *simplify debts* setting.
- **Friends** with a cross-group balance per currency, shared-expense history and one-click **Settle up** (records one payment per shared group, plus one for non-group expenses).
- **Expenses**: description, amount, currency, date, category, notes; in a group or friend-to-friend.
  - Split **equally, by exact amounts, by percentages, by shares, or by adjustment** (equal split ± per-person extras), with a live per-person preview.
  - **Single or multiple payers.**
  - Stored as `paid_share` / `owed_share` per person in integer minor units (paise/cents).
  - **Largest-remainder rounding**: leftover paise go to the largest fractional remainders, ties broken by a seeded shuffle so nobody always pays the extra paisa (the seed is saved, so edits stay stable).
  - Edit, delete and restore (soft delete, "Show deleted" toggle on the group page).
- **Balances per currency** (INR by default; also USD, EUR, GBP, AED, SGD, AUD, CAD). Currencies are never mixed.
- **Settle up**: per-group balances, a **Simplify debts** toggle that shows the minimal who-pays-whom list (and how many payments it saves), **Record payment** on each suggested transfer, and a custom-payment form. Payments are stored as special expenses, so the ledger stays one model.
- **Insights / charts** (overall or per group, any date range, presets for this month / 30 days / this year / all time):
  - spending by category (donut + subcategory breakdown),
  - spending by person — who paid vs. whose share it was (bars + table with net),
  - month-by-month total vs. your share.
- **Activity feed** (overall and per group).
- **Categories**: 6 parent categories with subcategories and emoji icons.

---

## Architecture

```
src/
  app/                    Next.js App Router pages (server components) + actions.ts (server actions)
    auth/verify/route.ts  magic-link callback → sets the session cookie
    dev/mailbox/          local inbox for emails when SMTP isn't configured (never in production)
    groups/ friends/ expenses/ insights/ activity/ invite/ login/ welcome/ profile/
  components/             UI (ExpenseForm and charts are client components)
  lib/
    split.ts              split engine: allocate() largest-remainder rounding, computeOwed(), buildShares()
    debts.ts              netBalances(), pairwiseDebts(), simplifyDebts() (greedy)
    money.ts              currency list, parsing/formatting minor units
    db.ts                 Postgres access: postgres.js (DATABASE_URL) or PGlite (local), "?" placeholders,
                          AsyncLocalStorage-scoped transactions, migration runner
    schema.ts             ordered migrations + category seed data
    services.ts           domain logic: users, friends, groups, expenses, payments, balances, insights, activity
    auth.ts               magic links, DB-backed sessions (httpOnly cookie), app URL, sign-in rate limits
    rate-limit.ts         DB-backed sliding-window limiter
    mail.ts               SMTP via nodemailer, or console + dev mailbox (dev only)
scripts/                  setup / seed / reset / import-sqlite (run with tsx, cross-platform)
tests/                    vitest: unit tests + DB tests on in-memory PGlite
```

**Stack:** Next.js 16 (App Router, Turbopack, server actions) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · Postgres via [postgres.js](https://github.com/porsager/postgres) (Neon in production) and [PGlite](https://pglite.dev) locally · nodemailer · Vitest.

**Data model** (amounts are integers in minor units):

```
users(id, email, name, default_currency, joined_at)        joined_at NULL = invited, not signed in yet
sessions(id=sha256(cookie), user_id, expires_at)
login_tokens(token_hash, email, next_path, expires_at, used_at)
friendships(user_id, friend_id)                             stored in both directions
groups(id, name, type, default_currency, simplify_debts, invite_token)
group_members(group_id, user_id)
categories(id, parent_id, name, icon, color)
expenses(id, group_id NULL=friend expense, description, amount_cents, currency, date,
         category_id, notes, is_payment, split_type, split_meta JSON, deleted_at)
expense_shares(expense_id, user_id, paid_cents, owed_cents)  net = paid − owed
activities(id, type, actor_id, group_id, expense_id, summary) + activity_users(activity_id, user_id)
dev_mailbox(id, to_email, subject, text_body, html_body)
rate_events(bucket, key, created_at)                        magic-link / invite throttling
schema_migrations(version, name, applied_at)
```

**Balances:** a user's net in a group and currency is `Σ(paid − owed)` over non-deleted expenses. Without simplifying, each expense's debtors owe its creditors in proportion to what they're owed, and these amounts are netted per pair. With simplifying, the greedy algorithm repeatedly matches the biggest debtor with the biggest creditor, which settles everyone in at most *n − 1* payments. A payment of X from A to B is an expense where A paid X and B owes X.

---

## Limitations / next steps

- Some email clients pre-open links, which could use up a single-use magic link. Just request a new one.
- No recurring expenses, comments, receipt upload, CSV export or currency conversion yet (the schema leaves room for them).
- Removing members from a group or deleting a group isn't implemented.
- The local PGlite database can be opened by only one process at a time (stop the dev server before running scripts).
