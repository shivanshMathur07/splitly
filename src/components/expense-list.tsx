import Link from "next/link";
import type { ExpenseWithShares } from "@/lib/services";
import { formatMoney } from "@/lib/money";
import { Empty, fmtDate } from "./ui";

export function ExpenseList({ expenses, userId, showGroup = false }: { expenses: ExpenseWithShares[]; userId: number; showGroup?: boolean }) {
  if (!expenses.length) return <Empty title="No expenses yet">Add the first one to start tracking.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {expenses.map((e) => {
        const mine = e.shares.find((s) => s.userId === userId);
        const net = mine ? mine.paid - mine.owed : 0;
        const payers = e.shares.filter((s) => s.paid > 0);
        if (e.is_payment) {
          const from = e.shares.find((s) => s.paid > 0);
          const to = e.shares.find((s) => s.owed > 0);
          return (
            <li key={e.id}>
              <Link href={`/expenses/${e.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-lg">💸</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">
                    <b>{from?.userId === userId ? "You" : from?.name}</b> paid <b>{to?.userId === userId ? "you" : to?.name}</b>{" "}
                    {formatMoney(e.amount_cents, e.currency)}
                  </p>
                  <p className="text-xs text-slate-400">{fmtDate(e.date)}{showGroup && e.group_name ? ` · ${e.group_name}` : ""}</p>
                </div>
              </Link>
            </li>
          );
        }
        return (
          <li key={e.id}>
            <Link href={`/expenses/${e.id}`} className={`flex items-center gap-3 py-3 hover:bg-slate-50 ${e.deleted_at ? "opacity-50" : ""}`}>
              <span className="grid h-10 w-10 place-items-center rounded-lg text-lg" style={{ background: `${e.category?.color ?? "#64748b"}1a` }}>
                {e.category?.icon ?? "🧮"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{e.description}</p>
                <p className="truncate text-xs text-slate-500">
                  {fmtDate(e.date)} · {payers.length > 1 ? `${payers.length} people paid` : `${payers[0]?.userId === userId ? "you" : payers[0]?.name} paid`}{" "}
                  {formatMoney(e.amount_cents, e.currency)}
                  {showGroup && e.group_name ? ` · ${e.group_name}` : ""}
                  {e.deleted_at ? " · deleted" : ""}
                </p>
              </div>
              <div className="text-right text-xs">
                {!mine ? (
                  <span className="text-slate-400">not involved</span>
                ) : net === 0 ? (
                  <span className="text-slate-400">no balance</span>
                ) : (
                  <>
                    <p className={net > 0 ? "text-emerald-700" : "text-orange-700"}>{net > 0 ? "you lent" : "you borrowed"}</p>
                    <p className={`font-semibold tabular-nums ${net > 0 ? "text-emerald-600" : "text-orange-600"}`}>{formatMoney(Math.abs(net), e.currency)}</p>
                  </>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
