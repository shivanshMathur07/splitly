import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requestLogin } from "@/app/actions";
import { ActionForm } from "@/components/action-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (await getCurrentUser()) redirect(next || "/");
  return (
    <div className="mx-auto mt-10 max-w-md">
      <div className="card">
        <h1 className="h1">Sign in</h1>
        <p className="muted mt-1">Enter your email and we&apos;ll send you a magic link. No password needed.</p>
        {error === "expired" && (
          <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">That link is invalid, expired or already used. Request a new one below.</p>
        )}
        <ActionForm action={requestLogin} submitLabel="Email me a sign-in link" className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next || "/"} />
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoFocus placeholder="you@example.com" className="input" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
