import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { formatMoney } from "@/lib/money";
import { SPLIT_TYPES } from "@/lib/split";
import { deleteExpenseAction } from "@/app/actions";
import { Avatar, fmtDate, TimeAgo } from "@/components/ui";

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const e = await svc.getExpense(Number(id), user.id);
  if (!e) notFound();
  const back = e.group_id ? `/groups/${e.group_id}` : "/";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={back} className="inline-flex min-h-11 items-center text-sm text-slate-500 hover:underline md:min-h-0">← {e.group_name ?? "Dashboard"}</Link>
      <div className="card">
        {e.deleted_at && <p className="mb-3 rounded-lg bg-rose-50 p-2 text-sm text-rose-700">This expense was deleted.</p>}
        <div className="flex items-start gap-3 md:gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center md:h-14 md:w-14 rounded-2xl text-3xl" style={{ background: `${e.category?.color ?? "#64748b"}1a` }}>
            {e.is_payment ? "💸" : e.category?.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="h1 break-words">{e.description}</h1>
            <p className="money text-2xl font-bold text-slate-900">{formatMoney(e.amount_cents, e.currency)}</p>
            <p className="muted mt-1">
              {fmtDate(e.date)} · {e.is_payment ? "Payment" : `${e.category?.name ?? "General"} · split ${SPLIT_TYPES.find((s) => s.value === e.split_type)?.label.toLowerCase()}`}
            </p>
            <p className="text-xs text-slate-400">Added by {e.created_by_name} · updated <TimeAgo at={e.updated_at} /></p>
          </div>
        </div>

        <ul className="mt-5 divide-y divide-slate-100" data-testid="shares">
          {e.shares.map((s) => (
            <li key={s.userId} className="flex items-center gap-3 py-2 text-sm">
              <Avatar id={s.userId} name={s.name} size={28} />
              <span className="min-w-0 flex-1 truncate">{s.userId === user.id ? "You" : s.name}</span>
              <span className="money shrink-0 text-right text-slate-500">
                {s.paid > 0 && <>paid <b className="text-slate-800">{formatMoney(s.paid, e.currency)}</b>{s.owed > 0 && " · "}</>}
                {s.owed > 0 && <>{e.is_payment ? "received" : s.userId === user.id ? "owe" : "owes"} <b className="text-slate-800">{formatMoney(s.owed, e.currency)}</b></>}
              </span>
            </li>
          ))}
        </ul>
        {e.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">📝 {e.notes}</p>}

        <div className="mt-5 flex gap-2">
          {!e.deleted_at && !e.is_payment && <Link href={`/expenses/${e.id}/edit`} className="btn-secondary">Edit</Link>}
          <form action={deleteExpenseAction}>
            <input type="hidden" name="id" value={e.id} />
            {e.deleted_at ? (
              <><input type="hidden" name="restore" value="1" /><button className="btn-secondary">Restore</button></>
            ) : (
              <button className="btn-danger">Delete</button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
