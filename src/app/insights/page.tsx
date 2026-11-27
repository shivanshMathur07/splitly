import Link from "next/link";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { formatMoney, isCurrency } from "@/lib/money";
import { CategoryChart, MonthlyChart, PersonChart } from "@/components/charts";
import { Empty } from "@/components/ui";
import { addDays, monthStartIST, todayIST, yearStartIST } from "@/lib/time";

// Presets are IST calendar ranges (expense dates are IST dates).
function preset(p: string): { from?: string; to?: string } {
  const today = todayIST();
  if (p === "month") return { from: monthStartIST(), to: today };
  if (p === "30d") return { from: addDays(today, -29), to: today };
  if (p === "year") return { from: yearStartIST(), to: today };
  return {};
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const groups = await svc.listGroups(user.id);
  const groupId = sp.group && groups.some((g) => g.id === Number(sp.group)) ? Number(sp.group) : null;
  const currencies = await svc.userCurrencies(user.id);
  const currency = sp.currency && isCurrency(sp.currency) ? sp.currency : currencies.includes(user.default_currency) ? user.default_currency : (currencies[0] ?? user.default_currency);
  const range = sp.range ? preset(sp.range) : { from: sp.from || undefined, to: sp.to || undefined };
  const data = await svc.getInsights(user.id, { groupId, from: range.from, to: range.to, currency });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (groupId) p.set("group", String(groupId));
    p.set("currency", currency);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/insights?${p}`;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h1">Insights</h1>
          <p className="muted">{groupId ? groups.find((g) => g.id === groupId)?.name : "All groups and friends"} · {range.from ?? "all time"} → {range.to ?? "today"}</p>
        </div>
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 text-sm md:mx-0 md:w-auto md:flex-wrap md:gap-1 md:px-0">
          {[["month", "This month"], ["30d", "Last 30 days"], ["year", "This year"], ["all", "All time"]].map(([k, l]) => (
            <Link key={k} href={qs({ range: k })} className={`inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 py-1.5 font-medium md:min-h-0 ${sp.range === k || (!sp.range && !sp.from && !sp.to && k === "all") ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{l}</Link>
          ))}
        </div>
      </div>

      <form className="card grid grid-cols-2 gap-3 sm:grid-cols-5" method="get" data-testid="insights-filter">
        <div className="col-span-2">
          <label className="label" htmlFor="group">Scope</label>
          <select id="group" name="group" defaultValue={groupId ?? ""} className="input">
            <option value="">All groups + friends</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" type="date" name="from" defaultValue={range.from} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" type="date" name="to" defaultValue={range.to} className="input" />
        </div>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <select name="currency" defaultValue={currency} className="input" aria-label="Currency">
            {(currencies.length ? currencies : [currency]).map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn">Apply</button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:gap-4 sm:grid-cols-4">
        {[
          ["Total spent", data.total],
          ["Your share", data.myShare],
          ["You paid", data.myPaid],
          ["Expenses", null],
        ].map(([label, v]) => (
          <div key={label as string} className="card">
            <p className="label">{label}</p>
            <p className="money truncate text-lg font-bold md:text-xl">{v === null ? data.count : formatMoney(v as number, currency)}</p>
          </div>
        ))}
      </div>

      {data.count === 0 ? (
        <Empty icon="📊" title="No expenses in this range">Try a wider date range or another currency.</Empty>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card">
              <h2 className="h2 mb-3">Spending by category</h2>
              <CategoryChart data={data.byCategory} currency={currency} />
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-500">Subcategories</summary>
                <ul className="mt-2 space-y-1">
                  {data.bySubcategory.map((s) => (
                    <li key={s.name} className="flex justify-between gap-2"><span className="min-w-0 truncate">{s.icon} {s.name} <span className="text-xs text-slate-400">({s.parent})</span></span><span className="shrink-0 tabular-nums">{formatMoney(s.total, currency)}</span></li>
                  ))}
                </ul>
              </details>
            </section>
            <section className="card">
              <h2 className="h2 mb-1">Spending by person</h2>
              <p className="muted mb-3">Who paid vs. whose share it was</p>
              <PersonChart data={data.byPerson} currency={currency} />
              <table className="mt-3 w-full table-fixed text-xs md:text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th>Person</th><th className="text-right">Paid</th><th className="text-right">Share</th><th className="text-right">Net</th></tr></thead>
                <tbody>
                  {data.byPerson.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="truncate py-1.5">{p.name}</td>
                      <td className="text-right tabular-nums">{formatMoney(p.paid, currency)}</td>
                      <td className="text-right tabular-nums">{formatMoney(p.share, currency)}</td>
                      <td className={`text-right tabular-nums ${p.paid - p.share >= 0 ? "text-emerald-600" : "text-orange-600"}`}>{formatMoney(p.paid - p.share, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
          <section className="card">
            <h2 className="h2 mb-3">Month by month</h2>
            <MonthlyChart data={data.byMonth} currency={currency} />
          </section>
        </>
      )}
    </div>
  );
}
