import { recordPaymentAction, toggleSimplifyAction } from "@/app/actions";
import type { CurrencyBalances, GroupRow, UserRow } from "@/lib/services";
import { displayName } from "@/lib/services";
import { CURRENCIES, centsToInput, formatMoney } from "@/lib/money";
import { ActionForm } from "./action-form";
import { Avatar } from "./ui";

export function SettlePanel({ group, balances, members, userId }: { group: GroupRow; balances: CurrencyBalances[]; members: UserRow[]; userId: number }) {
  const name = (id: number) => {
    if (id === userId) return "You";
    const m = members.find((x) => x.id === id);
    return m ? displayName(m) : `#${id}`;
  };
  const simplified = Boolean(group.simplify_debts);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="h2">Settle up</h2>
        <form action={toggleSimplifyAction} className="flex items-center gap-2">
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="simplify" value={simplified ? "0" : "1"} />
          <span className="text-sm text-slate-600">Simplify debts</span>
          <button
            aria-label="Toggle simplify debts"
            data-testid="simplify-toggle"
            className={`relative h-6 w-11 rounded-full transition ${simplified ? "bg-brand-600" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${simplified ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </form>
      </div>
      {balances.length === 0 && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">🎉 Everyone is settled up.</p>}
      {balances.map((b) => {
        const transfers = simplified ? b.simplified : b.original;
        return (
          <div key={b.currency} className="space-y-2">
            <p className="text-xs text-slate-500">
              {b.currency}: {b.original.length} payment{b.original.length === 1 ? "" : "s"} without simplifying →{" "}
              <b>{b.simplified.length}</b> with simplify on
            </p>
            <ul className="space-y-2" data-testid={`transfers-${b.currency}`}>
              {transfers.map((t) => (
                <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                  <Avatar id={t.from} name={name(t.from)} size={28} />
                  <p className="flex-1 text-sm">
                    <b>{name(t.from)}</b> {t.from === userId ? "owe" : "owes"} <b>{t.to === userId ? "you" : name(t.to)}</b>{" "}
                    <span className="font-semibold text-orange-600">{formatMoney(t.amount, b.currency)}</span>
                  </p>
                  <ActionForm action={recordPaymentAction} submitLabel="Record payment" submitClassName="btn btn-sm" className="flex items-center gap-2">
                    <input type="hidden" name="groupId" value={group.id} />
                    <input type="hidden" name="from" value={t.from} />
                    <input type="hidden" name="to" value={t.to} />
                    <input type="hidden" name="amount" value={centsToInput(t.amount)} />
                    <input type="hidden" name="currency" value={b.currency} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Record a custom payment</summary>
        <ActionForm action={recordPaymentAction} submitLabel="Save payment" className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="groupId" value={group.id} />
          <div>
            <label className="label">From (payer)</label>
            <select name="from" className="input" defaultValue={userId}>
              {members.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To (recipient)</label>
            <select name="to" className="input" defaultValue={members.find((m) => m.id !== userId)?.id}>
              {members.map((m) => <option key={m.id} value={m.id}>{name(m.id)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Amount</label>
            <input name="amount" inputMode="decimal" required className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="label">Currency</label>
            <select name="currency" defaultValue={group.default_currency} className="input">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
