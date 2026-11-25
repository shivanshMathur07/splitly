"use client";

import { useMemo, useState, useTransition } from "react";
import { saveExpenseAction, type ExpensePayload } from "@/app/actions";
import { CURRENCIES, centsToInput, formatMoney, parseAmount, parseScaled } from "@/lib/money";
import { computeOwed, SPLIT_TYPES, type SplitType } from "@/lib/split";
import type { CategoryRow } from "@/lib/services";

export interface Person {
  id: number;
  name: string;
}
export interface GroupOption {
  id: number;
  name: string;
  currency: string;
  members: Person[];
}
export interface ExpenseInitial {
  id: number;
  groupId: number | null;
  description: string;
  amount: string;
  currency: string;
  date: string;
  categoryId: number | null;
  notes: string;
  splitType: SplitType;
  participants: { userId: number; value: number }[];
  payers: { userId: number; paid: number }[];
  seed: number;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function parseSigned(v: string): number | null {
  const s = v.trim();
  if (s === "" || s === "-" || s === "+") return 0;
  const neg = s.startsWith("-");
  const c = parseAmount(s.replace(/^[+-]/, ""));
  return c === null ? null : neg ? -c : c;
}

function valueToInput(type: SplitType, v: number): string {
  if (type === "exact") return centsToInput(v);
  if (type === "adjustment") return v === 0 ? "" : centsToInput(v);
  if (type === "percent" || type === "shares") return String(v / 100);
  return "";
}

export function ExpenseForm({
  me,
  groups,
  friends,
  categories,
  defaultGroupId,
  defaultCurrency,
  initial,
}: {
  me: Person;
  groups: GroupOption[];
  friends: Person[];
  categories: CategoryRow[];
  defaultGroupId: number | null;
  defaultCurrency: string;
  initial?: ExpenseInitial;
}) {
  const [groupId, setGroupId] = useState<number | null>(initial ? initial.groupId : defaultGroupId);
  const group = groups.find((g) => g.id === groupId) ?? null;
  const people: Person[] = useMemo(() => (group ? group.members : [me, ...friends]), [group, me, friends]);
  const nameOf = (id: number) => (id === me.id ? "You" : people.find((p) => p.id === id)?.name ?? `#${id}`);

  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? group?.currency ?? defaultCurrency);
  const [date, setDate] = useState(initial?.date ?? today());
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [splitType, setSplitType] = useState<SplitType>(initial?.splitType ?? "equal");
  const [included, setIncluded] = useState<number[]>(
    initial ? initial.participants.map((p) => p.userId) : group ? group.members.map((m) => m.id) : [me.id],
  );
  const [values, setValues] = useState<Record<number, string>>(() =>
    initial ? Object.fromEntries(initial.participants.map((p) => [p.userId, valueToInput(initial.splitType, p.value)])) : {},
  );
  const [payerMode, setPayerMode] = useState<"single" | "multi">(initial && initial.payers.length > 1 ? "multi" : "single");
  const [payerId, setPayerId] = useState<number>(initial?.payers[0]?.userId ?? me.id);
  const [payerAmounts, setPayerAmounts] = useState<Record<number, string>>(() =>
    initial ? Object.fromEntries(initial.payers.map((p) => [p.userId, centsToInput(p.paid)])) : {},
  );
  const [seed] = useState(() => initial?.seed ?? Math.floor(Math.random() * 2 ** 31));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const changeGroup = (v: string) => {
    const gid = v === "" ? null : Number(v);
    setGroupId(gid);
    const g = groups.find((x) => x.id === gid);
    setIncluded(g ? g.members.map((m) => m.id) : [me.id]);
    setPayerId(me.id);
    setPayerAmounts({});
    if (g) setCurrency(g.currency);
  };

  const totalCents = parseAmount(amount);
  const participants = included.filter((id) => people.some((p) => p.id === id));

  // Turn the per-person inputs into split engine values
  const entries = participants.map((userId) => {
    const raw = values[userId] ?? "";
    let value: number | null = 0;
    if (splitType === "exact") value = raw === "" ? 0 : parseAmount(raw);
    else if (splitType === "percent") value = raw === "" ? 0 : parseScaled(raw, 2);
    else if (splitType === "shares") value = raw === "" ? 100 : parseScaled(raw, 2);
    else if (splitType === "adjustment") value = parseSigned(raw);
    return { userId, value };
  });
  const payers =
    payerMode === "single"
      ? [{ userId: payerId, paid: totalCents ?? 0 }]
      : people.map((p) => ({ userId: p.id, paid: parseAmount(payerAmounts[p.id] || "0") ?? -1 })).filter((p) => p.paid !== 0);

  let preview: number[] | null = null;
  let previewError: string | null = null;
  if (entries.some((e) => e.value === null)) previewError = "Check the numbers — use up to 2 decimals";
  else if (totalCents && totalCents > 0 && participants.length) {
    try {
      preview = computeOwed(totalCents, splitType, entries as { userId: number; value: number }[], seed);
    } catch (e) {
      previewError = (e as Error).message;
    }
  }
  const paidSum = payers.reduce((a, p) => a + p.paid, 0);

  const toggle = (id: number) => setIncluded((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (previewError) return setError(previewError);
    const payload: ExpensePayload = {
      id: initial?.id,
      groupId,
      description,
      amount,
      currency,
      date,
      categoryId,
      notes,
      splitType,
      participants: entries as { userId: number; value: number }[],
      payers,
      seed,
    };
    startTransition(async () => {
      const res = await saveExpenseAction(payload);
      if (res?.error) setError(res.error);
    });
  };

  const parents = categories.filter((c) => !c.parent_id);
  const hint = SPLIT_TYPES.find((s) => s.value === splitType)?.hint;

  return (
    <form onSubmit={submit} className="space-y-5" data-testid="expense-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="group">Group</label>
          <select id="group" className="input" value={groupId ?? ""} onChange={(e) => changeGroup(e.target.value)} disabled={Boolean(initial)}>
            <option value="">No group — split with friends</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Description</label>
          <input id="description" className="input" required maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at the beach shack" />
        </div>
        <div>
          <label className="label" htmlFor="amount">Amount</label>
          <div className="flex gap-2">
            <select aria-label="Currency" className="input w-28" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            <input id="amount" className="input text-lg font-semibold" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="category">Category</label>
            <select id="category" className="input" value={categoryId ?? 1} onChange={(e) => setCategoryId(Number(e.target.value))}>
              <option value={1}>🧮 General</option>
              {parents.filter((p) => p.id !== 1).map((p) => (
                <optgroup key={p.id} label={`${p.icon} ${p.name}`}>
                  <option value={p.id}>{p.icon} {p.name} (any)</option>
                  {categories.filter((c) => c.parent_id === p.id).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
      </div>

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Paid by</legend>
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Payer" className="input w-auto" value={payerMode === "multi" ? "multi" : payerId} onChange={(e) => {
            if (e.target.value === "multi") setPayerMode("multi");
            else { setPayerMode("single"); setPayerId(Number(e.target.value)); }
          }}>
            {people.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
            <option value="multi">Multiple people</option>
          </select>
          {payerMode === "multi" && totalCents !== null && (
            <span className={`text-xs ${paidSum === totalCents ? "text-emerald-600" : "text-orange-600"}`}>
              {formatMoney(paidSum, currency)} of {formatMoney(totalCents, currency)} entered
            </span>
          )}
        </div>
        {payerMode === "multi" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <span className="w-28 truncate">{nameOf(p.id)}</span>
                <input className="input" inputMode="decimal" placeholder="0.00" value={payerAmounts[p.id] ?? ""} onChange={(e) => setPayerAmounts({ ...payerAmounts, [p.id]: e.target.value })} />
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold">Split</legend>
        <div className="flex flex-wrap gap-1" role="tablist">
          {SPLIT_TYPES.map((s) => (
            <button
              type="button"
              key={s.value}
              role="tab"
              aria-selected={splitType === s.value}
              data-split={s.value}
              onClick={() => { setSplitType(s.value); setValues({}); }}
              className={`rounded-full px-3 py-1.5 text-sm ${splitType === s.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{hint}</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {people.map((p) => {
            const on = included.includes(p.id);
            const idx = participants.indexOf(p.id);
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand-600" aria-label={`Include ${nameOf(p.id)}`} />
                <span className="flex-1 text-sm">{nameOf(p.id)}</span>
                {on && splitType !== "equal" && (
                  <div className="flex items-center gap-1">
                    {splitType === "adjustment" && <span className="text-xs text-slate-400">±</span>}
                    <input
                      className="input w-28 text-right"
                      inputMode="decimal"
                      data-person={p.id}
                      value={values[p.id] ?? ""}
                      placeholder={splitType === "shares" ? "1" : "0"}
                      onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
                    />
                    <span className="w-6 text-xs text-slate-400">{splitType === "percent" ? "%" : splitType === "shares" ? "sh" : ""}</span>
                  </div>
                )}
                <span className="w-28 text-right text-sm tabular-nums text-slate-600">{on && preview && idx >= 0 ? formatMoney(preview[idx], currency) : ""}</span>
              </li>
            );
          })}
        </ul>
        {previewError && totalCents ? <p className="mt-2 text-xs text-orange-600">{previewError}</p> : null}
      </fieldset>

      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : initial ? "Save changes" : "Add expense"}</button>
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
      </div>
    </form>
  );
}
