import { describe, expect, it } from "vitest";
import { buildUpiUri, formatUpiAmount, isValidVpa, normalizeVpa, upiNote } from "../src/lib/upi";

describe("VPA validation", () => {
  it.each(["shivansh@okaxis", "9876543210@ybl", "first.last-1@oksbi", "a_b@paytm", "  Shivansh.M@OkICICI  "])("accepts %s", (v) => {
    expect(isValidVpa(v)).toBe(true);
  });
  it.each(["", "shivansh", "@okaxis", "shivansh@", "a@b", "sh ivansh@okaxis", "x@@ybl", "shivansh@ok axis", "shivansh@1bank", "shi@ok..axis", "shivansh@okaxis.", "s@okaxis", "name@ok/axis"])(
    "rejects %j",
    (v) => {
      expect(isValidVpa(v)).toBe(false);
    },
  );
  it("normalizes case and whitespace", () => {
    expect(normalizeVpa("  Shivansh.M@OkICICI ")).toBe("shivansh.m@okicici");
  });
});

describe("UPI amount formatting", () => {
  it("always uses two decimals with no grouping", () => {
    expect(formatUpiAmount(1)).toBe("0.01");
    expect(formatUpiAmount(50)).toBe("0.50");
    expect(formatUpiAmount(100)).toBe("1.00");
    expect(formatUpiAmount(904912)).toBe("9049.12");
    expect(formatUpiAmount(123456789)).toBe("1234567.89");
  });
  it("rejects zero, negatives and fractions of a paisa", () => {
    expect(() => formatUpiAmount(0)).toThrow();
    expect(() => formatUpiAmount(-500)).toThrow();
    expect(() => formatUpiAmount(10.5)).toThrow();
  });
});

describe("buildUpiUri", () => {
  it("builds a upi://pay link with pa, pn, am, cu and tn", () => {
    const uri = buildUpiUri({ vpa: "Asha@OkAxis", name: "Asha Rao", amountCents: 904912, note: upiNote("Goa trip") });
    expect(uri).toBe("upi://pay?pa=asha@okaxis&pn=Asha%20Rao&am=9049.12&cu=INR&tn=Splitly%3A%20Goa%20trip");
  });
  it("percent-encodes special characters (spaces as %20, never +)", () => {
    const uri = buildUpiUri({ vpa: "a.b@ybl", name: "Rahul & Co", amountCents: 100, note: "Splitly: Flat #302 / rent+bills" });
    const q = new URL(uri.replace("upi://", "https://x/")).searchParams;
    expect(uri).not.toContain("+");
    expect(uri).toContain("pn=Rahul%20%26%20Co");
    expect(q.get("pn")).toBe("Rahul & Co");
    expect(q.get("tn")).toBe("Splitly: Flat #302 / rent+bills");
    expect(q.get("am")).toBe("1.00");
    expect(q.get("cu")).toBe("INR");
  });
  it("encodes non-ASCII names and clips long notes", () => {
    const uri = buildUpiUri({ vpa: "meera@okhdfcbank", name: "मीरा", amountCents: 98000, note: "Splitly: " + "x".repeat(200) });
    const q = new URL(uri.replace("upi://", "https://x/")).searchParams;
    expect(q.get("pn")).toBe("मीरा");
    expect(q.get("tn")!.length).toBeLessThanOrEqual(60);
  });
  it("falls back to the VPA when no name is given and omits an empty note", () => {
    expect(buildUpiUri({ vpa: "x1@ybl", name: " ", amountCents: 2500 })).toBe("upi://pay?pa=x1@ybl&pn=x1%40ybl&am=25.00&cu=INR");
  });
  it("refuses an invalid VPA", () => {
    expect(() => buildUpiUri({ vpa: "not-a-vpa", name: "X", amountCents: 100 })).toThrow("Invalid UPI ID");
  });
});
