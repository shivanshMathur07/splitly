// Domain layer: all reads/writes go through here. Plain SQL over Postgres (see db.ts).
import crypto from "node:crypto";
import { all, get, insert, run, tx } from "./db";
import { buildShares, computeOwed, SplitError, type ShareRow, type SplitType } from "./split";
import { netBalances, pairwiseDebts, simplifyDebts, type Transfer } from "./debts";
import { formatMoney, isCurrency } from "./money";
import { isValidVpa, normalizeVpa } from "./upi";
import { todayIST } from "./time";
import { GENERAL_CATEGORY_ID } from "./schema";

export { SplitError };

// ───────────────────────── users & friends ─────────────────────────
export interface UserRow {
  id: number;
  email: string;
  name: string | null;
  default_currency: string;
  joined_at: string | null;
}

export const displayName = (u: { name: string | null; email: string }) => u.name || u.email.split("@")[0];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => EMAIL_RE.test(s.trim());

export async function getUser(id: number) {
  return await get<UserRow>("SELECT id, email, name, default_currency, joined_at FROM users WHERE id = ?", id);
}

export async function findOrCreateUser(email: string, name?: string | null): Promise<UserRow> {
  const e = email.trim().toLowerCase();
  if (!isEmail(e)) throw new SplitError(`"${email}" isn't a valid email address`);
  const existing = await get<UserRow>("SELECT id, email, name, default_currency, joined_at FROM users WHERE email = ?", e);
  if (existing) {
    if (!existing.name && name) await run("UPDATE users SET name = ? WHERE id = ?", name.trim(), existing.id);
    return (await getUser(existing.id))!;
  }
  await run("INSERT INTO users (email, name) VALUES (?, ?)", e, name?.trim() || null);
  return (await get<UserRow>("SELECT id, email, name, default_currency, joined_at FROM users WHERE email = ?", e))!;
}

export async function updateProfile(userId: number, name: string, currency: string, upi?: { id: string; name: string }) {
  if (!name.trim()) throw new SplitError("Please enter your name");
  if (!isCurrency(currency)) throw new SplitError("Unknown currency");
  await run("UPDATE users SET name = ?, default_currency = ? WHERE id = ?", name.trim().slice(0, 60), currency, userId);
  if (upi) {
    const id = normalizeVpa(upi.id);
    if (id && !isValidVpa(id)) throw new SplitError(`"${upi.id.trim()}" doesn't look like a UPI ID (it should be like name@okaxis)`);
    await run("UPDATE users SET upi_id = ?, upi_name = ? WHERE id = ?", id || null, upi.name.trim().slice(0, 50) || null, userId);
  }
}

export interface UpiProfile {
  id: number;
  upi_id: string | null;
  upi_name: string | null;
}

/** UPI details for a set of users (kept out of UserRow so old queries stay unchanged). */
export async function upiProfiles(ids: number[]): Promise<Map<number, UpiProfile>> {
  const out = new Map<number, UpiProfile>();
  if (!ids.length) return out;
  const rows = await all<UpiProfile>(`SELECT id, upi_id, upi_name FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
  for (const r of rows) out.set(r.id, r);
  return out;
}

export async function makeFriends(a: number, b: number) {
  if (a === b) return;
  await run("INSERT INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?) ON CONFLICT DO NOTHING", a, b, b, a);
}

export async function areFriends(a: number, b: number) {
  return Boolean(await get("SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?", a, b));
}

export async function listFriends(userId: number): Promise<UserRow[]> {
  return await all<UserRow>(
    `SELECT u.id, u.email, u.name, u.default_currency, u.joined_at FROM friendships f
     JOIN users u ON u.id = f.friend_id WHERE f.user_id = ? ORDER BY lower(COALESCE(u.name, u.email)), u.id`,
    userId,
  );
}

// ───────────────────────── activity ─────────────────────────
export async function logActivity(type: string, actorId: number, summary: string, userIds: number[], opts: { groupId?: number | null; expenseId?: number | null } = {}) {
  const id = await insert(
    "INSERT INTO activities (type, actor_id, group_id, expense_id, summary) VALUES (?, ?, ?, ?, ?)",
    type,
    actorId,
    opts.groupId ?? null,
    opts.expenseId ?? null,
    summary,
  );
  for (const u of new Set([actorId, ...userIds])) await run("INSERT INTO activity_users (activity_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", id, u);
}

export interface ActivityRow {
  id: number;
  type: string;
  summary: string;
  created_at: string;
  group_id: number | null;
  expense_id: number | null;
  group_name: string | null;
  actor_name: string | null;
  actor_email: string;
  actor_id: number;
}

export async function listActivity(userId: number, opts: { groupId?: number; limit?: number } = {}): Promise<ActivityRow[]> {
  return await all<ActivityRow>(
    `SELECT a.id, a.type, a.summary, a.created_at, a.group_id, a.expense_id, a.actor_id, g.name AS group_name,
            u.name AS actor_name, u.email AS actor_email
     FROM activities a JOIN activity_users au ON au.activity_id = a.id AND au.user_id = ?
     JOIN users u ON u.id = a.actor_id LEFT JOIN groups g ON g.id = a.group_id
     ${opts.groupId != null ? "WHERE a.group_id = ?" : ""} ORDER BY a.id DESC LIMIT ?`,
    ...(opts.groupId != null ? [userId, opts.groupId] : [userId]),
    opts.limit ?? 50,
  );
}

// ───────────────────────── groups ─────────────────────────
export const GROUP_TYPES = [
  { value: "home", label: "Home", icon: "🏠" },
  { value: "trip", label: "Trip", icon: "🧳" },
  { value: "couple", label: "Couple", icon: "💞" },
  { value: "office", label: "Office", icon: "💼" },
  { value: "other", label: "Other", icon: "👥" },
] as const;
export const groupIcon = (t: string) => GROUP_TYPES.find((g) => g.value === t)?.icon ?? "👥";

export interface GroupRow {
  id: number;
  name: string;
  type: string;
  default_currency: string;
  simplify_debts: number;
  invite_token: string;
  created_by: number;
  created_at: string;
}

const newInviteToken = () => crypto.randomBytes(12).toString("base64url");

export async function createGroup(actorId: number, input: { name: string; type: string; currency: string; simplify: boolean }): Promise<number> {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new SplitError("Give the group a name");
  if (!GROUP_TYPES.some((t) => t.value === input.type)) throw new SplitError("Unknown group type");
  if (!isCurrency(input.currency)) throw new SplitError("Unknown currency");
  return await tx(async () => {
    const id = await insert(
      "INSERT INTO groups (name, type, default_currency, simplify_debts, invite_token, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      name,
      input.type,
      input.currency,
      input.simplify ? 1 : 0,
      newInviteToken(),
      actorId,
    );
    await run("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", id, actorId);
    await logActivity("group_created", actorId, `created the group "${name}"`, [], { groupId: id });
    return id;
  });
}

export async function listGroups(userId: number) {
  return await all<GroupRow & { member_count: number }>(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members m2 WHERE m2.group_id = g.id) AS member_count
     FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ? ORDER BY g.created_at DESC, g.id DESC`,
    userId,
  );
}

export async function isMember(groupId: number, userId: number) {
  return Boolean(await get("SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?", groupId, userId));
}

export async function getGroupForUser(groupId: number, userId: number): Promise<GroupRow | null> {
  if (!await isMember(groupId, userId)) return null;
  return await get<GroupRow>("SELECT * FROM groups WHERE id = ?", groupId) ?? null;
}

export async function getGroupByInvite(token: string) {
  return await get<GroupRow>("SELECT * FROM groups WHERE invite_token = ?", token) ?? null;
}

export async function groupMembers(groupId: number): Promise<UserRow[]> {
  return await all<UserRow>(
    `SELECT u.id, u.email, u.name, u.default_currency, u.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id = ? ORDER BY m.joined_at, u.id`,
    groupId,
  );
}

export async function addMember(groupId: number, userId: number, actorId: number): Promise<boolean> {
  if (await isMember(groupId, userId)) return false;
  return await tx(async () => {
    await run("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", groupId, userId);
    const members = await groupMembers(groupId);
    for (const m of members) await makeFriends(m.id, userId);
    const u = (await getUser(userId))!;
    const g = (await get<GroupRow>("SELECT * FROM groups WHERE id = ?", groupId))!;
    const summary = actorId === userId ? `joined "${g.name}"` : `added ${displayName(u)} to "${g.name}"`;
    await logActivity("member_added", actorId, summary, members.map((m) => m.id), { groupId });
    return true;
  });
}

export async function updateGroup(groupId: number, actorId: number, input: { name?: string; type?: string; simplify?: boolean; currency?: string }) {
  const g = await getGroupForUser(groupId, actorId);
  if (!g) throw new SplitError("Group not found");
  const name = input.name?.trim() || g.name;
  const type = input.type && GROUP_TYPES.some((t) => t.value === input.type) ? input.type : g.type;
  const currency = input.currency && isCurrency(input.currency) ? input.currency : g.default_currency;
  const simplify = input.simplify === undefined ? g.simplify_debts : input.simplify ? 1 : 0;
  await run("UPDATE groups SET name = ?, type = ?, default_currency = ?, simplify_debts = ? WHERE id = ?", name, type, currency, simplify, groupId);
  if (simplify !== g.simplify_debts)
    await logActivity("group_updated", actorId, `turned simplify debts ${simplify ? "on" : "off"} in "${name}"`, (await groupMembers(groupId)).map((m) => m.id), { groupId });
}

export async function regenerateInvite(groupId: number, actorId: number) {
  if (!await isMember(groupId, actorId)) throw new SplitError("Group not found");
  await run("UPDATE groups SET invite_token = ? WHERE id = ?", newInviteToken(), groupId);
}

// ───────────────────────── categories ─────────────────────────
export interface CategoryRow {
  id: number;
  parent_id: number | null;
  name: string;
  icon: string;
  color: string;
}
export async function listCategories(): Promise<CategoryRow[]> {
  return await all<CategoryRow>("SELECT * FROM categories ORDER BY id");
}

// ───────────────────────── expenses ─────────────────────────
export interface ExpenseInput {
  groupId: number | null;
  description: string;
  amount: number; // minor units
  currency: string;
  date: string; // YYYY-MM-DD
  categoryId: number | null;
  notes?: string;
  splitType: SplitType;
  participants: { userId: number; value: number }[];
  payers: { userId: number; paid: number }[];
  seed?: number;
}

export interface ExpenseRow {
  id: number;
  group_id: number | null;
  description: string;
  amount_cents: number;
  currency: string;
  date: string;
  category_id: number | null;
  notes: string | null;
  is_payment: number;
  split_type: SplitType;
  split_meta: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ExpenseWithShares extends ExpenseRow {
  shares: (ShareRow & { name: string })[];
  category: CategoryRow | null;
  group_name: string | null;
  created_by_name: string;
}

async function validateExpense(actorId: number, input: ExpenseInput): Promise<ShareRow[]> {
  const description = input.description.trim();
  if (!description) throw new SplitError("Add a description");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new SplitError("Enter an amount greater than zero");
  if (!isCurrency(input.currency)) throw new SplitError("Unknown currency");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new SplitError("Pick a date");
  if (!input.payers.length) throw new SplitError("Choose who paid");
  const paid = input.payers.reduce((a, p) => a + p.paid, 0);
  if (input.payers.some((p) => p.paid < 0)) throw new SplitError("Paid amounts can't be negative");
  if (paid !== input.amount) throw new SplitError(`Paid amounts add up to ${formatMoney(paid, input.currency)}, not ${formatMoney(input.amount, input.currency)}`);
  const ids = new Set(input.participants.map((p) => p.userId));
  if (ids.size !== input.participants.length) throw new SplitError("Duplicate participant");

  // everyone involved must be allowed
  const involved = new Set([...ids, ...input.payers.map((p) => p.userId)]);
  if (input.groupId !== null) {
    if (!await isMember(input.groupId, actorId)) throw new SplitError("You're not in that group");
    for (const u of involved) if (!await isMember(input.groupId, u)) throw new SplitError("Everyone on the expense must be in the group");
  } else {
    for (const u of involved) if (u !== actorId && !await areFriends(actorId, u)) throw new SplitError("You can only split with friends outside a group");
    if (!involved.has(actorId)) throw new SplitError("You must be part of an expense outside a group");
    if (involved.size < 2) throw new SplitError("Pick at least one friend to split with");
  }
  const owed = computeOwed(input.amount, input.splitType, input.participants, input.seed);
  return buildShares(input.payers, input.participants.map((p, i) => ({ userId: p.userId, owed: owed[i] })));
}

async function writeShares(expenseId: number, shares: ShareRow[]) {
  await run("DELETE FROM expense_shares WHERE expense_id = ?", expenseId);
  for (const s of shares)
    await run("INSERT INTO expense_shares (expense_id, user_id, paid_cents, owed_cents) VALUES (?, ?, ?, ?)", expenseId, s.userId, s.paid, s.owed);
}

const splitMeta = (input: ExpenseInput) => JSON.stringify({ participants: input.participants, payers: input.payers, seed: input.seed ?? null });

export async function createExpense(actorId: number, input: ExpenseInput): Promise<number> {
  const shares = await validateExpense(actorId, input);
  return await tx(async () => {
    const id = await insert(
      `INSERT INTO expenses (group_id, description, amount_cents, currency, date, category_id, notes, split_type, split_meta, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.groupId,
      input.description.trim().slice(0, 120),
      input.amount,
      input.currency,
      input.date,
      input.categoryId ?? GENERAL_CATEGORY_ID,
      input.notes?.trim() || null,
      input.splitType,
      splitMeta(input),
      actorId,
    );
    await writeShares(id, shares);
    if (input.groupId === null) for (const s of shares) await makeFriends(actorId, s.userId);
    await logActivity("expense_added", actorId, `added "${input.description.trim()}" (${formatMoney(input.amount, input.currency)})`, shares.map((s) => s.userId), {
      groupId: input.groupId,
      expenseId: id,
    });
    return id;
  });
}

export async function canAccessExpense(e: ExpenseRow, userId: number): Promise<boolean> {
  if (e.group_id !== null) return await isMember(e.group_id, userId);
  return Boolean(await get("SELECT 1 FROM expense_shares WHERE expense_id = ? AND user_id = ?", e.id, userId));
}

export async function updateExpense(actorId: number, id: number, input: ExpenseInput) {
  const e = await get<ExpenseRow>("SELECT * FROM expenses WHERE id = ?", id);
  if (!e || e.deleted_at || !await canAccessExpense(e, actorId)) throw new SplitError("Expense not found");
  if (e.is_payment) throw new SplitError("Payments can't be edited; delete and record again");
  const shares = await validateExpense(actorId, { ...input, groupId: e.group_id });
  const before = (await all<{ user_id: number }>("SELECT user_id FROM expense_shares WHERE expense_id = ?", id)).map((r) => r.user_id);
  await tx(async () => {
    await run(
      `UPDATE expenses SET description = ?, amount_cents = ?, currency = ?, date = ?, category_id = ?, notes = ?, split_type = ?, split_meta = ?,
       updated_at = utc_now() WHERE id = ?`,
      input.description.trim().slice(0, 120),
      input.amount,
      input.currency,
      input.date,
      input.categoryId ?? GENERAL_CATEGORY_ID,
      input.notes?.trim() || null,
      input.splitType,
      splitMeta(input),
      id,
    );
    await writeShares(id, shares);
    await logActivity("expense_updated", actorId, `updated "${input.description.trim()}" (${formatMoney(input.amount, input.currency)})`, [...before, ...shares.map((s) => s.userId)], {
      groupId: e.group_id,
      expenseId: id,
    });
  });
}

export async function setExpenseDeleted(actorId: number, id: number, deleted: boolean) {
  const e = await get<ExpenseRow>("SELECT * FROM expenses WHERE id = ?", id);
  if (!e || !await canAccessExpense(e, actorId)) throw new SplitError("Expense not found");
  const users = (await all<{ user_id: number }>("SELECT user_id FROM expense_shares WHERE expense_id = ?", id)).map((r) => r.user_id);
  await run(`UPDATE expenses SET deleted_at = ${deleted ? "utc_now()" : "NULL"} WHERE id = ?`, id);
  await logActivity(deleted ? "expense_deleted" : "expense_restored", actorId, `${deleted ? "deleted" : "restored"} "${e.description}"`, users, {
    groupId: e.group_id,
    expenseId: id,
  });
  return e;
}

export type PaymentMethod = "manual" | "upi";

export async function recordPayment(
  actorId: number,
  input: { groupId: number | null; from: number; to: number; amount: number; currency: string; date?: string; note?: string; method?: PaymentMethod },
): Promise<number> {
  if (input.from === input.to) throw new SplitError("Pick two different people");
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new SplitError("Enter an amount greater than zero");
  if (!isCurrency(input.currency)) throw new SplitError("Unknown currency");
  if (input.groupId !== null) {
    if (!await isMember(input.groupId, actorId) || !await isMember(input.groupId, input.from) || !await isMember(input.groupId, input.to))
      throw new SplitError("Both people must be in the group");
  } else if (![input.from, input.to].includes(actorId) || !await areFriends(input.from, input.to)) {
    throw new SplitError("You can only record payments between you and a friend");
  }
  const from = (await getUser(input.from))!;
  const to = (await getUser(input.to))!;
  return await tx(async () => {
    const id = await insert(
      `INSERT INTO expenses (group_id, description, amount_cents, currency, date, category_id, notes, is_payment, split_type, created_by, payment_method)
       VALUES (?, 'Payment', ?, ?, ?, ?, ?, 1, 'exact', ?, ?)`,
      input.groupId,
      input.amount,
      input.currency,
      input.date || todayIST(),
      GENERAL_CATEGORY_ID,
      input.note || null,
      actorId,
      input.method ?? "manual",
    );
    // payer "paid" the amount, receiver "owes" it: payer's balance goes up, receiver's down
    await writeShares(id, [
      { userId: input.from, paid: input.amount, owed: 0 },
      { userId: input.to, paid: 0, owed: input.amount },
    ]);
    await logActivity("payment", actorId, `recorded ${displayName(from)} paid ${displayName(to)} ${formatMoney(input.amount, input.currency)}`, [input.from, input.to], {
      groupId: input.groupId,
      expenseId: id,
    });
    return id;
  });
}

async function attachShares(rows: ExpenseRow[]): Promise<ExpenseWithShares[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const shareRows = await all<{ expense_id: number; user_id: number; paid_cents: number; owed_cents: number; name: string | null; email: string }>(
    `SELECT s.expense_id, s.user_id, s.paid_cents, s.owed_cents, u.name, u.email FROM expense_shares s JOIN users u ON u.id = s.user_id
     WHERE s.expense_id IN (${ids.map(() => "?").join(",")}) ORDER BY s.user_id`,
    ...ids,
  );
  const cats = new Map((await listCategories()).map((c) => [c.id, c]));
  const userNames = new Map<number, string>();
  for (const u of await all<{ id: number; name: string | null; email: string }>(
    `SELECT id, name, email FROM users WHERE id IN (${rows.map(() => "?").join(",")})`,
    ...rows.map((r) => r.created_by),
  ))
    userNames.set(u.id, displayName(u));
  const groupNames = new Map((await all<{ id: number; name: string }>("SELECT id, name FROM groups")).map((g) => [g.id, g.name]));
  return rows.map((r) => ({
    ...r,
    shares: shareRows
      .filter((s) => s.expense_id === r.id)
      .map((s) => ({ userId: s.user_id, paid: s.paid_cents, owed: s.owed_cents, name: displayName(s) })),
    category: r.category_id ? cats.get(r.category_id) ?? null : null,
    group_name: r.group_id ? groupNames.get(r.group_id) ?? null : null,
    created_by_name: userNames.get(r.created_by) ?? "someone",
  }));
}

export async function getExpense(id: number, userId: number): Promise<ExpenseWithShares | null> {
  const e = await get<ExpenseRow>("SELECT * FROM expenses WHERE id = ?", id);
  if (!e || !await canAccessExpense(e, userId)) return null;
  return (await attachShares([e]))[0];
}

export async function listGroupExpenses(groupId: number, opts: { includeDeleted?: boolean; limit?: number } = {}): Promise<ExpenseWithShares[]> {
  return await attachShares(
    await all<ExpenseRow>(
      `SELECT * FROM expenses WHERE group_id = ? ${opts.includeDeleted ? "" : "AND deleted_at IS NULL"} ORDER BY date DESC, id DESC LIMIT ?`,
      groupId,
      opts.limit ?? 500,
    ),
  );
}

/** Expenses shared between two users (any group or none). */
export async function listSharedExpenses(userId: number, friendId: number): Promise<ExpenseWithShares[]> {
  return await attachShares(
    await all<ExpenseRow>(
      `SELECT e.* FROM expenses e WHERE e.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM expense_shares s WHERE s.expense_id = e.id AND s.user_id = ?)
       AND EXISTS (SELECT 1 FROM expense_shares s WHERE s.expense_id = e.id AND s.user_id = ?)
       ORDER BY e.date DESC, e.id DESC LIMIT 300`,
      userId,
      friendId,
    ),
  );
}

// ───────────────────────── balances ─────────────────────────
interface LedgerEntry {
  id: number;
  currency: string;
  group_id: number | null;
  shares: ShareRow[];
}

async function loadLedger(where: string, ...params: (number | string)[]): Promise<LedgerEntry[]> {
  const rows = await all<{ id: number; currency: string; group_id: number | null; user_id: number; paid_cents: number; owed_cents: number }>(
    `SELECT e.id, e.currency, e.group_id, s.user_id, s.paid_cents, s.owed_cents FROM expenses e
     JOIN expense_shares s ON s.expense_id = e.id WHERE e.deleted_at IS NULL AND ${where} ORDER BY e.id`,
    ...params,
  );
  const map = new Map<number, LedgerEntry>();
  for (const r of rows) {
    const e = map.get(r.id) ?? { id: r.id, currency: r.currency, group_id: r.group_id, shares: [] };
    e.shares.push({ userId: r.user_id, paid: r.paid_cents, owed: r.owed_cents });
    map.set(r.id, e);
  }
  return [...map.values()];
}

export interface CurrencyBalances {
  currency: string;
  net: Record<number, number>;
  original: Transfer[];
  simplified: Transfer[];
}

export async function groupBalances(groupId: number): Promise<CurrencyBalances[]> {
  const ledger = await loadLedger("e.group_id = ?", groupId);
  const currencies = [...new Set(ledger.map((l) => l.currency))].sort();
  return currencies
    .map((currency) => {
      const items = ledger.filter((l) => l.currency === currency);
      const net = netBalances(items);
      return { currency, net: Object.fromEntries(net), original: pairwiseDebts(items), simplified: simplifyDebts(net) };
    })
    .filter((b) => Object.values(b.net).some((v) => v !== 0));
}

/** Debts shown for a group, honoring its simplify toggle. */
export async function groupDebts(group: GroupRow): Promise<CurrencyBalances[]> {
  return await groupBalances(group.id);
}

/**
 * Per-friend balances for a user, per currency. Positive = friend owes the user.
 * Group debts follow each group's simplify setting; non-group expenses are pairwise.
 */
export async function friendBalances(userId: number): Promise<Map<number, Record<string, number>>> {
  const out = new Map<number, Record<string, number>>();
  const add = (friend: number, currency: string, amt: number) => {
    const rec = out.get(friend) ?? {};
    rec[currency] = (rec[currency] ?? 0) + amt;
    out.set(friend, rec);
  };
  const apply = (ts: Transfer[], currency: string) => {
    for (const t of ts) {
      if (t.to === userId) add(t.from, currency, t.amount);
      else if (t.from === userId) add(t.to, currency, -t.amount);
    }
  };
  for (const g of await listGroups(userId))
    for (const b of await groupBalances(g.id)) apply(g.simplify_debts ? b.simplified : b.original, b.currency);
  const direct = await loadLedger("e.group_id IS NULL AND e.id IN (SELECT expense_id FROM expense_shares WHERE user_id = ?)", userId);
  for (const currency of new Set(direct.map((d) => d.currency))) apply(pairwiseDebts(direct.filter((d) => d.currency === currency)), currency);
  for (const [k, rec] of out) {
    for (const c of Object.keys(rec)) if (rec[c] === 0) delete rec[c];
    if (!Object.keys(rec).length) out.delete(k);
  }
  return out;
}

/**
 * Settle everything between the user and a friend in one currency: records one
 * payment per group where they have a debt (respecting simplify) plus one for
 * non-group expenses. Returns the number of payments recorded.
 */
export async function settleWithFriend(userId: number, friendId: number, currency: string, method: PaymentMethod = "manual"): Promise<number[]> {
  if (!await areFriends(userId, friendId)) throw new SplitError("Not a friend");
  const payments: { groupId: number | null; from: number; to: number; amount: number }[] = [];
  const pick = (ts: Transfer[], groupId: number | null) => {
    for (const t of ts)
      if ((t.from === userId && t.to === friendId) || (t.from === friendId && t.to === userId)) payments.push({ groupId, ...t });
  };
  for (const g of await listGroups(userId)) {
    if (!await isMember(g.id, friendId)) continue;
    const b = (await groupBalances(g.id)).find((x) => x.currency === currency);
    if (b) pick(g.simplify_debts ? b.simplified : b.original, g.id);
  }
  const direct = await loadLedger("e.group_id IS NULL AND e.currency = ? AND e.id IN (SELECT expense_id FROM expense_shares WHERE user_id = ?)", currency, userId);
  pick(pairwiseDebts(direct), null);
  const ids: number[] = [];
  for (const p of payments) ids.push(await recordPayment(userId, { ...p, currency, method }));
  return ids;
}

/** Totals per currency: what the user is owed and what they owe overall. */
export async function userTotals(userId: number) {
  const totals: Record<string, { owed: number; owe: number }> = {};
  for (const rec of (await friendBalances(userId)).values())
    for (const [c, v] of Object.entries(rec)) {
      totals[c] ??= { owed: 0, owe: 0 };
      if (v > 0) totals[c].owed += v;
      else totals[c].owe += -v;
    }
  return totals;
}

/** User's net in a specific group, per currency. */
export async function groupNetForUser(groupId: number, userId: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const b of await groupBalances(groupId)) if (b.net[userId]) out[b.currency] = b.net[userId];
  return out;
}

// ───────────────────────── insights ─────────────────────────
export interface InsightsFilter {
  groupId: number | null; // null = all groups + non-group expenses
  from?: string;
  to?: string;
  currency: string;
}

export async function getInsights(userId: number, f: InsightsFilter) {
  const params: (string | number)[] = [f.currency];
  let scope: string;
  if (f.groupId !== null) {
    if (!await isMember(f.groupId, userId)) throw new SplitError("Group not found");
    scope = "e.group_id = ?";
    params.push(f.groupId);
  } else {
    scope = "(e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?) OR e.id IN (SELECT expense_id FROM expense_shares WHERE user_id = ?))";
    params.push(userId, userId);
  }
  let range = "";
  if (f.from) {
    range += " AND e.date >= ?";
    params.push(f.from);
  }
  if (f.to) {
    range += " AND e.date <= ?";
    params.push(f.to);
  }
  const base = `FROM expenses e WHERE e.deleted_at IS NULL AND e.is_payment = 0 AND e.currency = ? AND ${scope}${range}`;

  const expenses = await all<{ id: number; amount_cents: number; date: string; category_id: number | null }>(
    `SELECT e.id, e.amount_cents, e.date, e.category_id ${base}`,
    ...params,
  );
  const ids = expenses.map((e) => e.id);
  const shares = ids.length
    ? await all<{ expense_id: number; user_id: number; paid_cents: number; owed_cents: number }>(
        `SELECT expense_id, user_id, paid_cents, owed_cents FROM expense_shares WHERE expense_id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];
  const cats = new Map((await listCategories()).map((c) => [c.id, c]));
  const parentOf = (id: number | null) => {
    const c = id ? cats.get(id) : undefined;
    if (!c) return cats.get(GENERAL_CATEGORY_ID)!;
    return c.parent_id ? cats.get(c.parent_id)! : c;
  };
  const myShareByExpense = new Map<number, number>();
  for (const s of shares) if (s.user_id === userId) myShareByExpense.set(s.expense_id, s.owed_cents);

  const byCat = new Map<number, { name: string; icon: string; color: string; total: number; mine: number }>();
  const bySub = new Map<number, { name: string; icon: string; parent: string; total: number }>();
  const byMonth = new Map<string, { total: number; mine: number }>();
  let total = 0;
  for (const e of expenses) {
    total += e.amount_cents;
    const p = parentOf(e.category_id);
    const rec = byCat.get(p.id) ?? { name: p.name, icon: p.icon, color: p.color, total: 0, mine: 0 };
    rec.total += e.amount_cents;
    rec.mine += myShareByExpense.get(e.id) ?? 0;
    byCat.set(p.id, rec);
    const sub = (e.category_id && cats.get(e.category_id)) || cats.get(GENERAL_CATEGORY_ID)!;
    const srec = bySub.get(sub.id) ?? { name: sub.name, icon: sub.icon, parent: p.name, total: 0 };
    srec.total += e.amount_cents;
    bySub.set(sub.id, srec);
    const m = e.date.slice(0, 7);
    const mrec = byMonth.get(m) ?? { total: 0, mine: 0 };
    mrec.total += e.amount_cents;
    mrec.mine += myShareByExpense.get(e.id) ?? 0;
    byMonth.set(m, mrec);
  }
  const people = new Map<number, { paid: number; share: number }>();
  for (const s of shares) {
    const rec = people.get(s.user_id) ?? { paid: 0, share: 0 };
    rec.paid += s.paid_cents;
    rec.share += s.owed_cents;
    people.set(s.user_id, rec);
  }
  const names = new Map<number, string>();
  if (people.size)
    for (const u of await all<{ id: number; name: string | null; email: string }>(
      `SELECT id, name, email FROM users WHERE id IN (${[...people.keys()].map(() => "?").join(",")})`,
      ...people.keys(),
    ))
      names.set(u.id, u.id === userId ? `${displayName(u)} (you)` : displayName(u));

  return {
    currency: f.currency,
    count: expenses.length,
    total,
    myShare: people.get(userId)?.share ?? 0,
    myPaid: people.get(userId)?.paid ?? 0,
    byCategory: [...byCat.values()].sort((a, b) => b.total - a.total),
    bySubcategory: [...bySub.values()].sort((a, b) => b.total - a.total),
    byPerson: [...people.entries()].map(([id, v]) => ({ id, name: names.get(id) ?? `#${id}`, ...v })).sort((a, b) => b.paid - a.paid || b.share - a.share),
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  };
}

/** Currencies a user has expenses in (for filters). */
export async function userCurrencies(userId: number): Promise<string[]> {
  return (await all<{ currency: string }>(
    `SELECT DISTINCT e.currency FROM expenses e JOIN expense_shares s ON s.expense_id = e.id WHERE s.user_id = ? AND e.deleted_at IS NULL ORDER BY 1`,
    userId,
  )).map((r) => r.currency);
}

// ───────────────────────── dev mailbox ─────────────────────────
export async function listMail(limit = 100) {
  return await all<{ id: number; to_email: string; subject: string; text_body: string; html_body: string | null; created_at: string }>(
    "SELECT * FROM dev_mailbox ORDER BY id DESC LIMIT ?",
    limit,
  );
}
export async function clearMail() {
  await run("DELETE FROM dev_mailbox");
}
