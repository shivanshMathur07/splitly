// Postgres schema, as an ordered list of migrations. Each runs once (tracked in
// schema_migrations) the first time a process touches the database.
// Timestamps are stored as UTC text "YYYY-MM-DD HH:MM:SS" (same format the SQLite
// version used), so string comparisons and the UI's date parsing keep working.
// Emails are always stored lower-cased by the app.
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
CREATE OR REPLACE FUNCTION utc_now() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  default_currency TEXT NOT NULL DEFAULT 'INR',
  joined_at TEXT,                      -- NULL until the person signs in (invited placeholder)
  created_at TEXT NOT NULL DEFAULT utc_now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                 -- sha256 of the cookie value
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT utc_now(),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  next_path TEXT,
  created_at TEXT NOT NULL DEFAULT utc_now(),
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  default_currency TEXT NOT NULL DEFAULT 'INR',
  simplify_debts INTEGER NOT NULL DEFAULT 1,
  invite_token TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT utc_now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT utc_now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES categories(id),
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,   -- NULL = friend-to-friend expense
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  category_id INTEGER REFERENCES categories(id),
  notes TEXT,
  is_payment INTEGER NOT NULL DEFAULT 0,
  split_type TEXT NOT NULL DEFAULT 'equal',
  split_meta TEXT,                     -- JSON of the inputs used, for editing
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT utc_now(),
  updated_at TEXT NOT NULL DEFAULT utc_now(),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id, date);

CREATE TABLE IF NOT EXISTS expense_shares (
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  paid_cents INTEGER NOT NULL DEFAULT 0,
  owed_cents INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (expense_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON expense_shares(user_id);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  group_id INTEGER REFERENCES groups(id) ON DELETE SET NULL,
  expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT utc_now()
);

CREATE TABLE IF NOT EXISTS activity_users (
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS dev_mailbox (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT,
  created_at TEXT NOT NULL DEFAULT utc_now()
);
`,
  },
  {
    version: 2,
    name: "rate limits",
    sql: `
CREATE TABLE IF NOT EXISTS rate_events (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,                -- e.g. "login:email", "login:ip"
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rate_events ON rate_events(bucket, key, created_at);
CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email, created_at);
`,
  },
  {
    // Additive only (nullable columns, no rewrites), so a deployment that doesn't know
    // about these columns keeps working against the same database.
    version: 3,
    name: "upi payments",
    sql: `
ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS upi_name TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT;
`,
  },
  {
    // Additive: shareable group links now expire 7 days after they're created or reset.
    // Existing links get a fresh 7 days from the moment this runs.
    version: 4,
    name: "group invite link expiry",
    sql: `
ALTER TABLE groups ADD COLUMN IF NOT EXISTS invite_expires_at TEXT;
UPDATE groups SET invite_expires_at = to_char((now() AT TIME ZONE 'UTC') + interval '7 days', 'YYYY-MM-DD HH24:MI:SS')
  WHERE invite_expires_at IS NULL;
`,
  },
];

// Category tree: 6 parents, original names and emoji icons.
export const CATEGORY_TREE: { name: string; icon: string; color: string; children: [string, string][] }[] = [
  { name: "Food & drink", icon: "🍽️", color: "#f97316", children: [["Groceries", "🛒"], ["Dining out", "🍜"], ["Coffee & snacks", "☕"], ["Drinks", "🍹"]] },
  { name: "Travel", icon: "🧭", color: "#0ea5e9", children: [["Flights", "✈️"], ["Hotels", "🏨"], ["Cabs & rides", "🚕"], ["Fuel", "⛽"], ["Trains & buses", "🚆"], ["Parking & tolls", "🅿️"]] },
  { name: "Home", icon: "🏠", color: "#22c55e", children: [["Rent", "🔑"], ["Furniture", "🛋️"], ["Household supplies", "🧴"], ["Maintenance", "🛠️"]] },
  { name: "Bills", icon: "🧾", color: "#a855f7", children: [["Electricity", "💡"], ["Internet & phone", "📶"], ["Water & gas", "🚰"], ["Subscriptions", "🔁"]] },
  { name: "Fun", icon: "🎉", color: "#ec4899", children: [["Movies & events", "🎬"], ["Games", "🎮"], ["Sports", "🏸"], ["Gifts", "🎁"]] },
  { name: "Personal", icon: "🧑", color: "#eab308", children: [["Shopping", "🛍️"], ["Health", "💊"], ["Education", "📚"], ["Other", "📦"]] },
];
// Category id 1 is reserved for "General" (uncategorised).
export const GENERAL_CATEGORY_ID = 1;
