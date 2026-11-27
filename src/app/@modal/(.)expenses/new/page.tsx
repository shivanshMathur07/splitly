import { requireUser } from "@/lib/auth";
import { expenseFormData } from "@/lib/expense-form-data";
import { ExpenseForm } from "@/components/expense-form";
import { RouteSheet } from "@/components/bottom-sheet";

/** Soft navigation to /expenses/new (e.g. the mobile FAB) opens the form as a sheet over the current page. */
export default async function AddExpenseSheet({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await requireUser();
  const { group } = await searchParams;
  const data = await expenseFormData(user);
  const gid = group && data.groups.some((g) => g.id === Number(group)) ? Number(group) : (data.groups[0]?.id ?? null);
  return (
    <RouteSheet title="Add an expense" testId="sheet-add-expense">
      <ExpenseForm {...data} defaultGroupId={gid} defaultCurrency={user.default_currency} inSheet />
    </RouteSheet>
  );
}
