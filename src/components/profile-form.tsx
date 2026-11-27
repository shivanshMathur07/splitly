import { saveProfile } from "@/app/actions";
import { ActionForm } from "./action-form";
import { CURRENCIES } from "@/lib/money";

export function ProfileForm({
  name,
  currency,
  next,
  submitLabel,
  upi,
}: {
  name: string;
  currency: string;
  next?: string;
  submitLabel: string;
  /** Pass to show the UPI fields (profile page). */
  upi?: { id: string; name: string };
}) {
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
      {upi && (
        <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3 md:p-4" data-testid="upi-fields">
          <legend className="px-1 text-sm font-semibold">Get paid by UPI</legend>
          <p className="text-xs text-slate-500">Friends who owe you see a &ldquo;Pay via UPI&rdquo; button that opens GPay, PhonePe, Paytm or BHIM with the amount filled in.</p>
          <div>
            <label className="label" htmlFor="upi_id">UPI ID</label>
            <input
              id="upi_id"
              name="upi_id"
              defaultValue={upi.id}
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              maxLength={100}
              pattern="[A-Za-z0-9][A-Za-z0-9._\-]{1,255}@[A-Za-z][A-Za-z0-9.\-]{1,63}"
              title="Like yourname@okaxis or 9876543210@ybl"
              className="input font-mono"
              placeholder="yourname@okaxis"
            />
          </div>
          <div>
            <label className="label" htmlFor="upi_name">Name shown in UPI apps (optional)</label>
            <input id="upi_name" name="upi_name" defaultValue={upi.name} maxLength={50} className="input" placeholder="As on your bank account" />
          </div>
          <p className="text-xs text-slate-400">Leave the UPI ID empty to remove it.</p>
        </fieldset>
      )}
    </ActionForm>
  );
}
