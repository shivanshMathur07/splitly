// UPI deep links (NPCI "upi://pay" URI). Pure helpers, no I/O, so they're easy to test.

/** handle@psp, e.g. "shivansh.m@okaxis", "9876543210@ybl". */
const VPA_RE = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/;

export function normalizeVpa(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidVpa(raw: string): boolean {
  const v = normalizeVpa(raw);
  return VPA_RE.test(v) && !v.endsWith(".") && !v.includes("..");
}

/** Paise → "123.45" (always two decimals, no grouping, no currency sign). */
export function formatUpiAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("UPI amount must be a positive whole number of paise");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** UPI notes are short; most apps cut off around 50–80 chars. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface UpiPayParams {
  vpa: string;
  name: string;
  amountCents: number;
  note?: string;
}

/**
 * Build upi://pay?pa=…&pn=…&am=…&cu=INR&tn=… with every value percent-encoded
 * (spaces as %20, not "+", which some UPI apps show literally).
 */
export function buildUpiUri(p: UpiPayParams): string {
  if (!isValidVpa(p.vpa)) throw new Error("Invalid UPI ID");
  const parts: [string, string][] = [
    ["pa", normalizeVpa(p.vpa)],
    ["pn", clip(p.name.trim() || normalizeVpa(p.vpa), 50)],
    ["am", formatUpiAmount(p.amountCents)],
    ["cu", "INR"],
  ];
  if (p.note?.trim()) parts.push(["tn", clip(p.note.trim(), 60)]);
  // "@" stays literal in the VPA: it's what every UPI app expects (and it's safe in a query value).
  const enc = (k: string, v: string) => (k === "pa" ? encodeURIComponent(v).replace(/%40/g, "@") : encodeURIComponent(v));
  return `upi://pay?${parts.map(([k, v]) => `${k}=${enc(k, v)}`).join("&")}`;
}

export const upiNote = (context: string) => `Splitly: ${context}`;
