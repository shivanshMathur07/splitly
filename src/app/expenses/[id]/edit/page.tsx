import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { expenseFormData } from "@/lib/expense-form-data";
import { ExpenseForm, type ExpenseInitial } from "@/components/expense-form";
import { centsToInput } from "@/lib/money";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const e = await svc.getExpense(Number(id), user.id);
  if (!e || e.deleted_at) notFound();
  if (e.is_payment) redirect(`/expenses/${e.id}`);
  const meta = e.split_meta ? JSON.parse(e.split_meta) : null;
  const initial: ExpenseInitial = {
    id: e.id,
    groupId: e.group_id,
    description: e.description,
    amount: centsToInput(e.amount_cents),
    currency: e.currency,
    date: e.date,
    categoryId: e.category_id,
    notes: e.notes ?? "",
    splitType: e.split_type,
    participants: meta?.participants ?? e.shares.filter((s) => s.owed > 0).map((s) => ({ userId: s.userId, value: s.owed })),
    payers: meta?.payers ?? e.shares.filter((s) => s.paid > 0).map((s) => ({ userId: s.userId, paid: s.paid })),
    seed: meta?.seed ?? 0,
  };
  if (!meta) initial.splitType = "exact";
  return (
    <div className="mx-auto max-w-2xl card">
      <h1 className="h1 mb-5">Edit expense</h1>
      <ExpenseForm {...(await expenseFormData(user))} defaultGroupId={e.group_id} defaultCurrency={e.currency} initial={initial} />
    </div>
  );
}
