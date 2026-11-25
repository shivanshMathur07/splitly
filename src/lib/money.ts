// Money helpers. All amounts are stored as integer minor units ("cents"/"paise").

export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const DEFAULT_CURRENCY: CurrencyCode = "INR";

export function isCurrency(code: string): code is CurrencyCode {
  return CURRENCIES.some((c) => c.code === code);
}

/**
 * Parse a user-entered decimal string ("1,234.5") into integer minor units.
 * Returns null when the input is not a valid non-negative amount with at most 2 decimals.
 */
export function parseAmount(input: string | number): number | null {
  const s = String(input).replace(/[,\s]/g, "").trim();
  if (!/^\d+(\.\d{0,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Parse a decimal with up to `decimals` places into a scaled integer (e.g. "33.33" -> 3333). */
export function parseScaled(input: string | number, decimals = 2): number | null {
  const s = String(input).replace(/[,\s]/g, "").trim();
  const re = new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`);
  if (s === "" || s === "." || !re.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const v = Number(whole || "0") * 10 ** decimals + Number((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
  return Number.isSafeInteger(v) ? v : null;
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoney(cents: number, currency: string = DEFAULT_CURRENCY): string {
  const locale = currency === "INR" ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${currency} ${centsToInput(cents)}`;
  }
}
