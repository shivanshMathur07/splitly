import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import * as svc from "@/lib/services";
import { Avatar } from "./ui";

/**
 * Right-hand balance column for list rows: a small label over a bold amount, so
 * "you owe" vs "you are owed" reads at a glance on narrow screens.
 */
export function BalanceStack({ net, owedLabel = "you are owed", oweLabel = "you owe" }: { net: Record<string, number>; owedLabel?: string; oweLabel?: string }) {
  const entries = Object.entries(net).filter(([, v]) => v !== 0);
  if (entries.length === 0) return <span className="whitespace-nowrap text-xs font-medium text-slate-400">settled up</span>;
  return (
    <div className="space-y-0.5 text-right">
      {entries.map(([c, v]) => (
        <div key={c} className="leading-tight">
          <p className={`whitespace-nowrap text-[11px] font-medium ${v > 0 ? "text-emerald-700" : "text-orange-700"}`}>{v > 0 ? owedLabel : oweLabel}</p>
          <p className={`money whitespace-nowrap text-sm font-bold ${v > 0 ? "text-emerald-600" : "text-orange-600"}`}>{formatMoney(Math.abs(v), c)}</p>
        </div>
      ))}
    </div>
  );
}

export function GroupRows({ groups, nets }: { groups: (svc.GroupRow & { member_count: number })[]; nets: Map<number, Record<string, number>> }) {
  return (
    <ul className="-mx-1 divide-y divide-slate-100">
      {groups.map((g) => (
        <li key={g.id}>
          <Link href={`/groups/${g.id}`} className="flex min-h-16 items-center gap-3 rounded-lg px-1 py-3 hover:bg-slate-50 active:bg-slate-50">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl">{svc.groupIcon(g.type)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{g.name}</p>
              <p className="truncate text-xs text-slate-500">{g.member_count} members{g.simplify_debts ? " · simplified" : ""}</p>
            </div>
            <BalanceStack net={nets.get(g.id) ?? {}} />
            <ChevronRight size={18} className="shrink-0 text-slate-300 md:hidden" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FriendRows({ friends, balances, showEmail = false }: { friends: svc.UserRow[]; balances: Map<number, Record<string, number>>; showEmail?: boolean }) {
  return (
    <ul className="-mx-1 divide-y divide-slate-100">
      {friends.map((f) => (
        <li key={f.id}>
          <Link href={`/friends/${f.id}`} className="flex min-h-14 items-center gap-3 rounded-lg px-1 py-2.5 hover:bg-slate-50 active:bg-slate-50">
            <Avatar id={f.id} name={svc.displayName(f)} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">
                {svc.displayName(f)}
                {!f.joined_at && <span className="ml-2 rounded bg-slate-100 px-1.5 align-middle text-[10px] font-medium text-slate-500">invited</span>}
              </p>
              {showEmail && <p className="truncate text-xs text-slate-500">{f.email}</p>}
            </div>
            <BalanceStack net={balances.get(f.id) ?? {}} owedLabel="owes you" />
            <ChevronRight size={18} className="shrink-0 text-slate-300 md:hidden" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Per-currency totals: swipeable compact cards on phones, the original 3-column card on desktop. */
export function BalanceCards({ currencies, totals }: { currencies: string[]; totals: Record<string, { owed: number; owe: number }> }) {
  return (
    <>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:hidden" data-testid="balance-cards">
        {currencies.map((c) => {
          const t = totals[c] ?? { owed: 0, owe: 0 };
          const net = t.owed - t.owe;
          return (
            <div key={c} className={`${currencies.length > 1 ? "w-[85%] max-w-sm" : "w-full"} shrink-0 snap-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-md shadow-brand-900/10`}>
              <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Total balance · {c}</p>
              <p className="money mt-1 text-3xl font-extrabold tracking-tight">{net < 0 ? "−" : net > 0 ? "+" : ""}{formatMoney(Math.abs(net), c)}</p>
              <p className="text-xs text-brand-100">{net > 0 ? "overall, you are owed" : net < 0 ? "overall, you owe" : "you're all settled up"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-white/95 px-3 py-2">
                  <p className="text-[11px] font-semibold text-orange-700">You owe</p>
                  <p className="money truncate text-sm font-bold text-orange-600">{formatMoney(t.owe, c)}</p>
                </div>
                <div className="rounded-xl bg-white/95 px-3 py-2">
                  <p className="text-[11px] font-semibold text-emerald-700">You are owed</p>
                  <p className="money truncate text-sm font-bold text-emerald-600">{formatMoney(t.owed, c)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {currencies.map((c) => {
          const t = totals[c] ?? { owed: 0, owe: 0 };
          return (
            <div key={c} className="card md:col-span-3">
              <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                <div>
                  <p className="label">Total balance ({c})</p>
                  <p className={`money text-xl font-semibold ${t.owed - t.owe >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
                    {t.owed - t.owe < 0 ? "−" : ""}{formatMoney(Math.abs(t.owed - t.owe), c)}
                  </p>
                </div>
                <div>
                  <p className="label">You owe</p>
                  <p className="money text-xl font-semibold text-orange-600">{formatMoney(t.owe, c)}</p>
                </div>
                <div>
                  <p className="label">You are owed</p>
                  <p className="money text-xl font-semibold text-emerald-600">{formatMoney(t.owed, c)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
