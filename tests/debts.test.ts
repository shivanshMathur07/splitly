import { describe, expect, it } from "vitest";
import { netBalances, pairwiseDebts, simplifyDebts, type Transfer } from "../src/lib/debts";

const applyTransfers = (bal: Record<number, number>, ts: Transfer[]) => {
  const b = { ...bal };
  for (const t of ts) {
    b[t.from] += t.amount;
    b[t.to] -= t.amount;
  }
  return b;
};

describe("netBalances", () => {
  it("sums paid minus owed per user", () => {
    const net = netBalances([
      { shares: [{ userId: 1, paid: 300, owed: 100 }, { userId: 2, paid: 0, owed: 100 }, { userId: 3, paid: 0, owed: 100 }] },
      { shares: [{ userId: 2, paid: 60, owed: 30 }, { userId: 3, paid: 0, owed: 30 }] },
    ]);
    expect(Object.fromEntries(net)).toEqual({ 1: 200, 2: -70, 3: -130 });
  });
});

describe("simplifyDebts", () => {
  it("settles everyone with the greedy largest-debtor / largest-creditor rule", () => {
    const bal = { 1: 5000, 2: -3000, 3: -2000 };
    const ts = simplifyDebts(bal);
    expect(ts).toEqual([
      { from: 2, to: 1, amount: 3000 },
      { from: 3, to: 1, amount: 2000 },
    ]);
    expect(Object.values(applyTransfers(bal, ts)).every((v) => v === 0)).toBe(true);
  });

  it("collapses a chain A->B->C into a single transfer", () => {
    // A owes B 10, B owes C 10 => A owes C 10
    const ts = simplifyDebts({ 1: -1000, 2: 0, 3: 1000 });
    expect(ts).toEqual([{ from: 1, to: 3, amount: 1000 }]);
  });

  it("uses at most n-1 transfers and zeroes all balances", () => {
    const bal: Record<number, number> = { 1: 12345, 2: -4000, 3: -333, 4: 7000, 5: -15012 };
    const ts = simplifyDebts(bal);
    expect(ts.length).toBeLessThanOrEqual(4);
    expect(Object.values(applyTransfers(bal, ts)).every((v) => v === 0)).toBe(true);
    expect(ts.every((t) => t.amount > 0)).toBe(true);
  });

  it("returns nothing when everyone is settled", () => {
    expect(simplifyDebts({ 1: 0, 2: 0 })).toEqual([]);
  });

  it("rejects balances that do not sum to zero", () => {
    expect(() => simplifyDebts({ 1: 10, 2: -5 })).toThrow();
  });

  it("randomized: always settles exactly", () => {
    for (let trial = 0; trial < 200; trial++) {
      const n = 2 + (trial % 7);
      const bal: Record<number, number> = {};
      let s = 0;
      for (let i = 1; i < n; i++) {
        bal[i] = Math.floor(Math.sin(trial * 31 + i) * 100000);
        s += bal[i];
      }
      bal[n] = -s;
      const ts = simplifyDebts(bal);
      expect(ts.length).toBeLessThanOrEqual(n - 1);
      expect(Object.values(applyTransfers(bal, ts)).every((v) => v === 0)).toBe(true);
    }
  });
});

describe("pairwiseDebts", () => {
  it("nets debts between the same pair across expenses", () => {
    const ts = pairwiseDebts([
      { shares: [{ userId: 1, paid: 1000, owed: 500 }, { userId: 2, paid: 0, owed: 500 }] },
      { shares: [{ userId: 2, paid: 400, owed: 200 }, { userId: 1, paid: 0, owed: 200 }] },
    ]);
    expect(ts).toEqual([{ from: 2, to: 1, amount: 300 }]);
  });

  it("keeps a chain unsimplified (more transfers than simplified)", () => {
    const expenses = [
      { shares: [{ userId: 2, paid: 1000, owed: 0 }, { userId: 1, paid: 0, owed: 1000 }] }, // 1 owes 2
      { shares: [{ userId: 3, paid: 1000, owed: 0 }, { userId: 2, paid: 0, owed: 1000 }] }, // 2 owes 3
    ];
    expect(pairwiseDebts(expenses)).toHaveLength(2);
    expect(simplifyDebts(netBalances(expenses))).toEqual([{ from: 1, to: 3, amount: 1000 }]);
  });

  it("splits a debtor's shortfall across multiple payers proportionally", () => {
    const ts = pairwiseDebts([
      {
        shares: [
          { userId: 1, paid: 600, owed: 300 },
          { userId: 2, paid: 300, owed: 300 },
          { userId: 3, paid: 0, owed: 300 },
        ],
      },
    ]);
    expect(ts).toEqual([{ from: 3, to: 1, amount: 300 }]);
  });
});
