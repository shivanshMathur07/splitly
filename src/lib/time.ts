// Everything in Splitly is shown and bucketed in India time (Asia/Kolkata, UTC+5:30),
// whatever timezone the server (Vercel = UTC) or the viewer's device is in.
//
// Two kinds of values exist in the database:
//  - instants: created_at / updated_at / joined_at… stored as UTC text "YYYY-MM-DD HH:MM:SS"
//    (from utc_now()). They stay UTC and are converted to IST only for display.
//  - calendar dates: expenses.date "YYYY-MM-DD". These *are* IST calendar dates, so they're
//    never shifted again (only formatted).

export const IST_TZ = "Asia/Kolkata";

const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** The IST calendar date of an instant, as "YYYY-MM-DD". */
export function istDate(at: Date | number = new Date()): string {
  const parts = Object.fromEntries(ymdFmt.formatToParts(typeof at === "number" ? new Date(at) : at).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Today's date in India, "YYYY-MM-DD". Use for every date default. */
export const todayIST = (now: Date | number = new Date()) => istDate(now);

const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Shift a "YYYY-MM-DD" calendar date by whole days (no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** First day of the IST month / year containing `now`. */
export const monthStartIST = (now: Date | number = new Date()) => `${istDate(now).slice(0, 7)}-01`;
export const yearStartIST = (now: Date | number = new Date()) => `${istDate(now).slice(0, 4)}-01-01`;

/** Parse a stored UTC instant ("YYYY-MM-DD HH:MM:SS", ISO, or a Date). */
export function parseInstant(v: string | Date): Date {
  if (v instanceof Date) return v;
  const s = v.trim();
  if (isDateOnly(s)) throw new Error(`"${s}" is a calendar date, not an instant`);
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s.replace(" ", "T") : `${s.replace(" ", "T")}Z`);
}

const dateFmtIST = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, day: "numeric", month: "short", year: "numeric" });
const dateFmtFixed = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
const dateTimeFmtIST = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * "28 Nov 2026". A calendar date ("YYYY-MM-DD") is printed as-is; an instant is
 * converted to its IST date first.
 */
export function formatDateIST(v: string | Date): string {
  if (typeof v === "string" && isDateOnly(v.trim())) {
    const [y, m, d] = v.trim().split("-").map(Number) as [number, number, number];
    return dateFmtFixed.format(new Date(Date.UTC(y, m - 1, d)));
  }
  return dateFmtIST.format(parseInstant(v));
}

/** "28 Nov 2026, 12:15 am IST" for an instant. */
export function formatDateTimeIST(v: string | Date): string {
  return `${dateTimeFmtIST.format(parseInstant(v)).replace(/\s?(am|pm)$/i, (x) => x.toLowerCase())} IST`;
}

/** "just now", "5m ago", "3h ago", "2d ago", else the IST date. */
export function timeAgoIST(v: string | Date, now: Date | number = Date.now()): string {
  const t = parseInstant(v).getTime();
  const s = Math.max(0, ((typeof now === "number" ? now : now.getTime()) - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return formatDateIST(v);
}
