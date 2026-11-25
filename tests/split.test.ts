import { describe, expect, it } from "vitest";
import { allocate, buildShares, computeOwed, SplitError } from "../src/lib/split";
import { parseAmount, parseScaled } from "../src/lib/money";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("allocate (largest remainder)", () => {
  it("splits 100.00 three ways to the paisa", () => {
    const r = allocate(10000, [1, 1, 1]);
    expect(sum(r)).toBe(10000);
    expect(r.sort()).toEqual([3333, 3333, 3334]);
  });

  it("gives leftover units to the largest fractional remainders", () => {
    // 1000 split 1:2:3 -> 166.67, 333.33, 500 -> floors 166, 333, 500, rem .67 .33 0
    expect(allocate(1000, [1, 2, 3])).toEqual([167, 333, 500]);
  });

  it("breaks ties by input order without a seed", () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  it("shuffles ties reproducibly with a seed", () => {
    const a = allocate(1, [1, 1, 1, 1], 42);
    const b = allocate(1, [1, 1, 1, 1], 42);
    expect(a).toEqual(b);
    expect(sum(a)).toBe(1);
    // over many seeds every person sometimes gets the extra unit
    const winners = new Set<number>();
    for (let s = 0; s < 200; s++) winners.add(allocate(1, [1, 1, 1, 1], s).indexOf(1));
    expect(winners.size).toBe(4);
  });

  it("never gives units to zero-weight people", () => {
    const r = allocate(101, [0, 1, 1]);
    expect(r[0]).toBe(0);
    expect(sum(r)).toBe(101);
  });

  it("handles very large totals exactly", () => {
    const r = allocate(9_000_000_000_001, [3, 3, 3]);
    expect(sum(r)).toBe(9_000_000_000_001);
  });

  it("throws when weights are all zero", () => {
    expect(() => allocate(100, [0, 0])).toThrow();
  });
});

describe("computeOwed", () => {
  const people = (vals: number[]) => vals.map((value, i) => ({ userId: i + 1, value }));

  it("equal", () => {
    expect(sum(computeOwed(100, "equal", people([0, 0, 0])))).toBe(100);
  });

  it("exact must match the total", () => {
    expect(computeOwed(1000, "exact", people([250, 750]))).toEqual([250, 750]);
    expect(() => computeOwed(1000, "exact", people([250, 700]))).toThrow(SplitError);
  });

  it("percent uses basis points and must total 100%", () => {
    // 33.33 / 33.33 / 33.34 % of 99.99
    const r = computeOwed(9999, "percent", people([3333, 3333, 3334]));
    expect(sum(r)).toBe(9999);
    expect(() => computeOwed(9999, "percent", people([5000, 4000]))).toThrow(/100%/);
  });

  it("shares split proportionally", () => {
    // 2 shares vs 1 share of 300.00
    expect(computeOwed(30000, "shares", people([200, 100]))).toEqual([20000, 10000]);
    expect(sum(computeOwed(1000, "shares", people([150, 100, 50])))).toBe(1000);
  });

  it("adjustment adds extras on top of an equal split", () => {
    // 1000 total, person 1 had +200 extra -> remaining 800 split equally
    expect(computeOwed(1000, "adjustment", people([200, 0]))).toEqual([600, 400]);
    expect(() => computeOwed(100, "adjustment", people([200, 0]))).toThrow(SplitError);
  });

  it("rejects empty participant lists and zero totals", () => {
    expect(() => computeOwed(100, "equal", [])).toThrow(SplitError);
    expect(() => computeOwed(0, "equal", people([0]))).toThrow(SplitError);
  });
});

describe("buildShares", () => {
  it("merges payers and owed into paid/owed rows that net to zero", () => {
    const rows = buildShares([{ userId: 1, paid: 900 }], [
      { userId: 1, owed: 300 },
      { userId: 2, owed: 300 },
      { userId: 3, owed: 300 },
    ]);
    expect(rows).toEqual([
      { userId: 1, paid: 900, owed: 300 },
      { userId: 2, paid: 0, owed: 300 },
      { userId: 3, paid: 0, owed: 300 },
    ]);
    expect(sum(rows.map((r) => r.paid - r.owed))).toBe(0);
  });
});

describe("parsing", () => {
  it("parses amounts to minor units", () => {
    expect(parseAmount("1,234.5")).toBe(123450);
    expect(parseAmount("0.01")).toBe(1);
    expect(parseAmount("12")).toBe(1200);
    expect(parseAmount("1.234")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("parses scaled decimals", () => {
    expect(parseScaled("33.33")).toBe(3333);
    expect(parseScaled("1.5")).toBe(150);
    expect(parseScaled("")).toBeNull();
  });
});
