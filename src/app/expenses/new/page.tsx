import { requireUser } from "@/lib/auth";
import { expenseFormData } from "@/lib/expense-form-data";
import { ExpenseForm } from "@/components/expense-form";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await requireUser();
  const { group } = await searchParams;
  const data = await expenseFormData(user);
  const gid = group && data.groups.some((g) => g.id === Number(group)) ? Number(group) : (data.groups[0]?.id ?? null);
  return (
    <div className="mx-auto max-w-2xl card">
      <h1 className="h1 mb-5">Add an expense</h1>
      <ExpenseForm {...data} defaultGroupId={gid} defaultCurrency={user.default_currency} />
    </div>
  );
}
