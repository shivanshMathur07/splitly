// Split engine: turns an expense total + a split description into per-person owed shares,
// rounded to the minor unit with the largest-remainder method.

export type SplitType = "equal" | "exact" | "percent" | "shares" | "adjustment";
export const SPLIT_TYPES: { value: SplitType; label: string; hint: string }[] = [
  { value: "equal", label: "Equally", hint: "Everyone selected pays the same" },
  { value: "exact", label: "Exact amounts", hint: "Enter what each person owes" },
  { value: "percent", label: "Percentages", hint: "Percentages must add up to 100" },
  { value: "shares", label: "Shares", hint: "e.g. 2 shares vs 1 share" },
  { value: "adjustment", label: "Adjustment", hint: "Equal split plus/minus per-person extras" },
];

/** Small deterministic PRNG (mulberry32) so ties can be shuffled reproducibly. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Allocate `total` minor units across integer `weights` proportionally.
 * Each person gets floor(total * w / sum); leftover units go one each to the
 * largest fractional remainders. Ties are broken by a seeded shuffle (or by
 * input order when no seed is given). The result always sums to `total` exactly.
 */
export function allocate(total: number, weights: number[], seed?: number): number[] {
  if (!Number.isSafeInteger(total)) throw new Error("total must be an integer number of minor units");
  if (weights.length === 0) {
    if (total === 0) return [];
    throw new Error("Nobody to split between");
  }
  if (weights.some((w) => !Number.isSafeInteger(w) || w < 0)) throw new Error("weights must be non-negative integers");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) throw new Error("Split weights add up to zero");

  const sign = total < 0 ? -1n : 1n;
  const T = BigInt(Math.abs(total));
  const S = BigInt(sum);
  const base: bigint[] = [];
  const rem: bigint[] = [];
  for (const w of weights) {
    const p = T * BigInt(w);
    base.push(p / S);
    rem.push(p % S);
  }
  let leftover = Number(T - base.reduce((a, b) => a + b, 0n));

  // tie-break order: seeded shuffle or stable index order
  const tiebreak = weights.map((_, i) => i);
  if (seed !== undefined) {
    const rnd = seededRandom(seed);
    for (let i = tiebreak.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [tiebreak[i], tiebreak[j]] = [tiebreak[j], tiebreak[i]];
    }
  }
  const rank = new Map(tiebreak.map((idx, pos) => [idx, pos]));
  const order = weights
    .map((_, i) => i)
    .filter((i) => weights[i] > 0)
    .sort((a, b) => (rem[b] > rem[a] ? 1 : rem[b] < rem[a] ? -1 : rank.get(a)! - rank.get(b)!));
  for (let k = 0; leftover > 0; k++, leftover--) base[order[k % order.length]] += 1n;
  return base.map((b) => Number(b * sign));
}

export interface SplitEntry {
  userId: number;
  /** Raw value whose meaning depends on split type:
   *  equal: ignored; exact: minor units; percent: basis points (1% = 100);
   *  shares: share count scaled by 100; adjustment: signed minor units. */
  value: number;
}

export class SplitError extends Error {}

/** Compute owed minor units per participant. Order of the result follows `entries`. */
export function computeOwed(total: number, type: SplitType, entries: SplitEntry[], seed?: number): number[] {
  if (entries.length === 0) throw new SplitError("Pick at least one person to split with");
  if (total <= 0) throw new SplitError("Amount must be greater than zero");
  switch (type) {
    case "equal":
      return allocate(total, entries.map(() => 1), seed);
    case "exact": {
      const sum = entries.reduce((a, e) => a + e.value, 0);
      if (entries.some((e) => e.value < 0)) throw new SplitError("Exact amounts can't be negative");
      if (sum !== total) throw new SplitError(`Exact amounts add up to ${(sum / 100).toFixed(2)}, not ${(total / 100).toFixed(2)}`);
      return entries.map((e) => e.value);
    }
    case "percent": {
      const sum = entries.reduce((a, e) => a + e.value, 0);
      if (entries.some((e) => e.value < 0)) throw new SplitError("Percentages can't be negative");
      if (sum !== 10000) throw new SplitError(`Percentages add up to ${(sum / 100).toFixed(2)}%, not 100%`);
      return allocate(total, entries.map((e) => e.value), seed);
    }
    case "shares": {
      if (entries.some((e) => e.value < 0)) throw new SplitError("Shares can't be negative");
      if (entries.every((e) => e.value === 0)) throw new SplitError("Give at least one person a share");
      return allocate(total, entries.map((e) => e.value), seed);
    }
    case "adjustment": {
      const adj = entries.reduce((a, e) => a + e.value, 0);
      const rest = total - adj;
      if (rest < 0) throw new SplitError("Adjustments are larger than the total");
      const equal = allocate(rest, entries.map(() => 1), seed);
      const owed = equal.map((v, i) => v + entries[i].value);
      if (owed.some((v) => v < 0)) throw new SplitError("An adjustment makes someone's share negative");
      return owed;
    }
    default:
      throw new SplitError("Unknown split type");
  }
}

export interface ShareRow {
  userId: number;
  paid: number;
  owed: number;
}

/** Merge payer and owed lists into paid/owed rows (the core ledger representation). */
export function buildShares(payers: { userId: number; paid: number }[], owed: { userId: number; owed: number }[]): ShareRow[] {
  const map = new Map<number, ShareRow>();
  for (const p of payers) {
    const r = map.get(p.userId) ?? { userId: p.userId, paid: 0, owed: 0 };
    r.paid += p.paid;
    map.set(p.userId, r);
  }
  for (const o of owed) {
    const r = map.get(o.userId) ?? { userId: o.userId, paid: 0, owed: 0 };
    r.owed += o.owed;
    map.set(o.userId, r);
  }
  return [...map.values()].filter((r) => r.paid !== 0 || r.owed !== 0);
}
