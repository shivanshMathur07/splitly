import { saveProfile } from "@/app/actions";
import { ActionForm } from "./action-form";
import { CURRENCIES } from "@/lib/money";

export function ProfileForm({ name, currency, next, submitLabel }: { name: string; currency: string; next?: string; submitLabel: string }) {
  return (
    <ActionForm action={saveProfile} submitLabel={submitLabel} className="mt-5 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label className="label" htmlFor="name">Your name</label>
        <input id="name" name="name" defaultValue={name} required maxLength={60} className="input" placeholder="e.g. Shivansh" />
      </div>
      <div>
        <label className="label" htmlFor="currency">Default currency</label>
        <select id="currency" name="currency" defaultValue={currency} className="input">
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
          ))}
        </select>
      </div>
    </ActionForm>
  );
}
