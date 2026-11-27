import { ArrowRight, HandCoins } from "lucide-react";
import { recordPaymentAction, toggleSimplifyAction } from "@/app/actions";
import type { CurrencyBalances, GroupRow, UserRow } from "@/lib/services";
import { displayName } from "@/lib/services";
import { CURRENCIES, centsToInput, formatMoney } from "@/lib/money";
import { ActionForm } from "./action-form";
import { SheetButton } from "./bottom-sheet";
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="h2">Settle up</h2>
        <form action={toggleSimplifyAction}>
          <input type="hidden" name="groupId" value={group.id} />
          <input type="hidden" name="simplify" value={simplified ? "0" : "1"} />
          <button aria-label="Toggle simplify debts" data-testid="simplify-toggle" className="flex min-h-11 items-center gap-2 md:min-h-0">
            <span className="text-sm text-slate-600">Simplify debts</span>
            <span className={`relative h-6 w-11 rounded-full transition ${simplified ? "bg-brand-600" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${simplified ? "left-[22px]" : "left-0.5"}`} />
            </span>
          </button>
        </form>
      </div>
      {balances.length === 0 && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">🎉 Everyone is settled up.</p>}
      {balances.map((b) => {
        const transfers = simplified ? b.simplified : b.original;
        return (
          <div key={b.currency} className="space-y-2">
            <p className="text-xs text-slate-500">
              {b.currency}: {b.original.length} payment{b.original.length === 1 ? "" : "s"} without simplifying →{" "}
              <b>{b.simplified.length}</b> with simplify on
            </p>
            <ul className="space-y-2" data-testid={`transfers-${b.currency}`}>
              {transfers.map((t) => {
                const tone = t.from === userId ? "text-orange-600" : t.to === userId ? "text-emerald-600" : "text-slate-800";
                const sentence = (
                  <>
                    <b>{name(t.from)}</b> {t.from === userId ? "owe" : "owes"} <b>{t.to === userId ? "you" : name(t.to)}</b>
                  </>
                );
                return (
                  <li key={`${t.from}-${t.to}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="flex shrink-0 items-center -space-x-2">
                      <Avatar id={t.from} name={name(t.from)} size={30} />
                      <span className="z-10 grid h-5 w-5 place-items-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200"><ArrowRight size={12} /></span>
                      <Avatar id={t.to} name={name(t.to)} size={30} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{sentence}</p>
                      <p className={`money text-base font-bold ${tone}`}>{formatMoney(t.amount, b.currency)}</p>
                    </div>
                    {/* Desktop: one-click record, as before. */}
                    <div className="hidden md:block">
                      <ActionForm action={recordPaymentAction} submitLabel="Record payment" submitClassName="btn btn-sm" className="flex items-center gap-2">
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="from" value={t.from} />
                        <input type="hidden" name="to" value={t.to} />
                        <input type="hidden" name="amount" value={centsToInput(t.amount)} />
                        <input type="hidden" name="currency" value={b.currency} />
                      </ActionForm>
                    </div>
                    {/* Mobile: confirm in a bottom sheet (amount editable for partial payments). */}
                    <SheetButton label="Settle" title="Record a payment" className="btn btn-sm shrink-0 md:hidden" testId="sheet-settle" closeOnSuccess>
                      <div className="mb-4 flex items-center justify-center gap-4 rounded-2xl bg-slate-50 p-4">
                        <div className="text-center"><Avatar id={t.from} name={name(t.from)} size={48} /><p className="mt-1 text-xs font-medium">{name(t.from)}</p></div>
                        <ArrowRight className="text-slate-400" />
                        <div className="text-center"><Avatar id={t.to} name={name(t.to)} size={48} /><p className="mt-1 text-xs font-medium">{t.to === userId ? "You" : name(t.to)}</p></div>
                      </div>
                      <ActionForm action={recordPaymentAction} submitLabel="Record payment" submitClassName="btn w-full" className="space-y-4">
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="from" value={t.from} />
                        <input type="hidden" name="to" value={t.to} />
                        <input type="hidden" name="currency" value={b.currency} />
                        <div>
                          <label className="label" htmlFor={`pay-${b.currency}-${t.from}-${t.to}`}>Amount ({b.currency})</label>
                          <input
                            id={`pay-${b.currency}-${t.from}-${t.to}`}
                            name="amount"
                            inputMode="decimal"
                            autoComplete="off"
                            required
                            defaultValue={centsToInput(t.amount)}
                            className="input money text-center text-2xl font-bold"
                          />
                          <p className="mt-1 text-center text-xs text-slate-500">Full balance is {formatMoney(t.amount, b.currency)} — change it for a partial payment.</p>
                        </div>
                      </ActionForm>
                    </SheetButton>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <details className="hidden rounded-xl border border-slate-200 p-3 md:block">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Record a custom payment</summary>
        <CustomPaymentForm group={group} members={members} userId={userId} name={name} className="mt-3 grid gap-3 sm:grid-cols-2" />
      </details>
      <div className="md:hidden">
        <SheetButton label="Record a custom payment" title="Record a payment" className="btn-secondary w-full" testId="sheet-custom-payment" icon={<HandCoins size={18} />} closeOnSuccess>
          <CustomPaymentForm group={group} members={members} userId={userId} name={name} className="space-y-4" />
        </SheetButton>
      </div>
    </div>
  );
}

function CustomPaymentForm({ group, members, userId, name, className }: { group: GroupRow; members: UserRow[]; userId: number; name: (id: number) => string; className: string }) {
  return (
    <ActionForm action={recordPaymentAction} submitLabel="Save payment" className={className} submitClassName="btn w-full sm:w-auto">
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
        <input name="amount" inputMode="decimal" autoComplete="off" required className="input money" placeholder="0.00" />
      </div>
      <div>
        <label className="label">Currency</label>
        <select name="currency" defaultValue={group.default_currency} className="input">
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
      </div>
    </ActionForm>
  );
}
