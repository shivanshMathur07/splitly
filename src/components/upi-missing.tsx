import { remindUpiAction } from "@/app/actions";
import { ActionForm } from "./action-form";

/** Shown instead of the UPI button when the person you owe hasn't added a UPI ID. */
export function UpiMissing({ name, userId }: { name: string; userId: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" data-testid="upi-missing">
      <span className="flex-1">Ask {name} to add their UPI ID to pay in one tap.</span>
      <ActionForm action={remindUpiAction} submitLabel="Send reminder" submitClassName="btn-secondary btn-sm" className="flex items-center gap-2">
        <input type="hidden" name="userId" value={userId} />
      </ActionForm>
    </div>
  );
}
