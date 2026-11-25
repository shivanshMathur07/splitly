import { requireUser } from "@/lib/auth";
import { createGroupAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { GROUP_TYPES } from "@/lib/services";
import { CURRENCIES } from "@/lib/money";

export default async function NewGroupPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl card">
      <h1 className="h1">Create a group</h1>
      <p className="muted mt-1">Everyone you add gets an email with a magic link to join.</p>
      <ActionForm action={createGroupAction} submitLabel="Create group" className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="name">Group name</label>
          <input id="name" name="name" required maxLength={80} className="input" placeholder="e.g. Goa trip, Flat 302" />
        </div>
        <div>
          <span className="label">Type</span>
          <div className="flex flex-wrap gap-2">
            {GROUP_TYPES.map((t, i) => (
              <label key={t.value} className="cursor-pointer">
                <input type="radio" name="type" value={t.value} defaultChecked={i === 0} className="peer sr-only" />
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1.5 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700">
                  {t.icon} {t.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="currency">Default currency</label>
            <select id="currency" name="currency" defaultValue={user.default_currency} className="input">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="simplify" defaultChecked className="h-4 w-4 accent-brand-600" /> Simplify debts by default
          </label>
        </div>
        <div>
          <label className="label" htmlFor="members">Invite members (optional)</label>
          <textarea id="members" name="members" rows={3} className="input" placeholder={"Asha <asha@example.com>\nrahul@example.com"} />
          <p className="mt-1 text-xs text-slate-500">One per line or comma-separated. You can also share an invite link later.</p>
        </div>
      </ActionForm>
    </div>
  );
}
