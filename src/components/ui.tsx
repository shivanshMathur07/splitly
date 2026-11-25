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

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function fmtDate(d: string) {
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d.replace(" ", "T") + "Z");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function timeAgo(sqlTime: string) {
  const t = new Date(sqlTime.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(sqlTime);
}
