"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import type { FormState } from "@/app/actions";

/** A form bound to a server action that shows its error/success message inline. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className = "space-y-3",
  submitClassName = "btn",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Lets a surrounding bottom sheet close itself after a successful submit.
    if (state.message && !state.error) ref.current?.dispatchEvent(new CustomEvent("actionform:success", { bubbles: true }));
  }, [state]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={submitClassName} disabled={pending}>
          {pending ? "Working…" : submitLabel}
        </button>
        {state.error && <p className="text-sm text-rose-600" role="alert">{state.error}</p>}
        {state.message && (
          <p className="text-sm text-emerald-700" role="status">
            {state.message}{" "}
            {state.devMailbox && (
              <Link href="/dev/mailbox" className="link font-medium">
                Open dev mailbox →
              </Link>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
