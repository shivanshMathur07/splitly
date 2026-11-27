import { notFound } from "next/navigation";
import { devMailboxEnabled } from "@/lib/mail";
import * as svc from "@/lib/services";
import { clearMailboxAction } from "@/app/actions";
import { TimeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Local-only inbox that captures every email when SMTP isn't configured. */
export default async function MailboxPage() {
  if (!devMailboxEnabled()) notFound();
  const mails = await svc.listMail();
  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} className="link break-all font-medium" data-testid="mail-link">{part}</a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="h1">📬 Dev mailbox</h1>
          <p className="muted">SMTP isn&apos;t configured, so emails land here (and in the server console). Newest first.</p>
        </div>
        <form action={clearMailboxAction}><button className="btn-secondary btn-sm">Clear</button></form>
      </div>
      {mails.length === 0 && <p className="card text-sm text-slate-500">No emails yet. Request a sign-in link to see one here.</p>}
      {mails.map((m) => (
        <article key={m.id} className="card" data-testid="mail">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <p><span className="text-slate-500">To:</span> <b data-testid="mail-to">{m.to_email}</b></p>
            <p className="text-xs text-slate-400"><TimeAgo at={m.created_at} /></p>
          </div>
          <p className="mt-1 font-semibold">{m.subject}</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">{linkify(m.text_body)}</pre>
        </article>
      ))}
    </div>
  );
}
