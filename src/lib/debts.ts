// Balance + debt calculations over paid/owed share rows.
import { allocate, type ShareRow } from "./split";

export interface Transfer {
  from: number; // debtor user id
  to: number; // creditor user id
  amount: number; // minor units, > 0
}

/** Net balance per user: positive = is owed money, negative = owes money. */
export function netBalances(expenses: { shares: ShareRow[] }[]): Map<number, number> {
  const net = new Map<number, number>();
  for (const e of expenses)
    for (const s of e.shares) net.set(s.userId, (net.get(s.userId) ?? 0) + s.paid - s.owed);
  return net;
}

/**
 * Who owes whom without simplification: inside each expense, every debtor's
 * shortfall is split across that expense's creditors in proportion to what
 * they're owed. Pair amounts are then netted across expenses.
 */
export function pairwiseDebts(expenses: { shares: ShareRow[] }[]): Transfer[] {
  const pair = new Map<string, number>(); // key "a:b" with a<b; positive => a owes b
  const add = (from: number, to: number, amt: number) => {
    if (from === to || amt === 0) return;
    const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
    const k = `${a}:${b}`;
    pair.set(k, (pair.get(k) ?? 0) + sign * amt);
  };
  for (const e of expenses) {
    const nets = e.shares.map((s) => ({ id: s.userId, net: s.paid - s.owed }));
    const creditors = nets.filter((n) => n.net > 0);
    const debtors = nets.filter((n) => n.net < 0);
    if (!creditors.length || !debtors.length) continue;
    for (const d of debtors) {
      const parts = allocate(-d.net, creditors.map((c) => c.net));
      parts.forEach((amt, i) => add(d.id, creditors[i].id, amt));
    }
  }
  const out: Transfer[] = [];
  for (const [k, v] of pair) {
    if (v === 0) continue;
    const [a, b] = k.split(":").map(Number);
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v });
  }
  return out.sort((x, y) => y.amount - x.amount || x.from - y.from || x.to - y.to);
}

/**
 * Simplify debts: repeatedly match the person who owes the most with the person
 * who is owed the most and settle the smaller of the two amounts. Produces at most
 * n-1 transfers and never changes anyone's net balance.
 */
export function simplifyDebts(balances: Map<number, number> | Record<number, number>): Transfer[] {
  const entries = balances instanceof Map ? [...balances.entries()] : Object.entries(balances).map(([k, v]) => [Number(k), v] as [number, number]);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total !== 0) throw new Error(`Balances must sum to zero (got ${total})`);
  const debtors = entries.filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }));
  const creditors = entries.filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }));
  const byAmt = (a: { id: number; amt: number }, b: { id: number; amt: number }) => b.amt - a.amt || a.id - b.id;
  const out: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmt);
    creditors.sort(byAmt);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.amt, c.amt);
    out.push({ from: d.id, to: c.id, amount: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
  }
  return out;
}

/** Group share rows by currency. */
export function byCurrency<T extends { currency: string }>(items: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const list = m.get(it.currency) ?? [];
    list.push(it);
    m.set(it.currency, list);
  }
  return m;
}
