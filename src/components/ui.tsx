import { formatDateIST, formatDateTimeIST, parseInstant, timeAgoIST } from "@/lib/time";
import { formatMoney } from "@/lib/money";

const COLORS = ["#0d9488", "#6366f1", "#f97316", "#ec4899", "#0ea5e9", "#84cc16", "#a855f7", "#eab308", "#ef4444", "#14b8a6"];
export const colorFor = (id: number) => COLORS[Math.abs(id) % COLORS.length];

export function Avatar({ id, name, size = 32 }: { id: number; name: string; size?: number }) {
  const initials = name
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: colorFor(id), fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}

/** Signed amount from the viewer's perspective: positive = owed to you (green), negative = you owe (orange). */
export function Amount({ cents, currency, className = "" }: { cents: number; currency: string; className?: string }) {
  const tone = cents > 0 ? "text-emerald-600" : cents < 0 ? "text-orange-600" : "text-slate-400";
  return <span className={`font-semibold tabular-nums ${tone} ${className}`}>{formatMoney(Math.abs(cents), currency)}</span>;
}

export function BalanceLine({ cents, currency }: { cents: number; currency: string }) {
  if (cents === 0) return <span className="text-sm text-slate-400">settled up</span>;
  return (
    <span className="text-sm">
      <span className={cents > 0 ? "text-emerald-700" : "text-orange-700"}>{cents > 0 ? "owes you " : "you owe "}</span>
      <Amount cents={cents} currency={currency} />
    </span>
  );
}

export function Empty({ title, children, icon, action }: { title: string; children?: React.ReactNode; icon?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
      {icon && <span className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-slate-200" aria-hidden>{icon}</span>}
      <p className="font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 max-w-xs text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Dates and times are always shown in India time (see lib/time.ts). */
export function fmtDate(d: string) {
  return formatDateIST(d);
}

export function timeAgo(sqlTime: string) {
  return timeAgoIST(sqlTime);
}

/** Relative time with the exact IST timestamp on hover / long-press. */
export function TimeAgo({ at, className }: { at: string; className?: string }) {
  return (
    <time dateTime={parseInstant(at).toISOString()} title={formatDateTimeIST(at)} className={className}>
      {timeAgoIST(at)}
    </time>
  );
}
