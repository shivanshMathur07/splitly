import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { joinGroupAction, requestLogin } from "@/app/actions";
import { ActionForm } from "@/components/action-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const group = await svc.getGroupByInvite(token);
  if (!group) notFound();
  const user = await getCurrentUser();
  const members = await svc.groupMembers(group.id);
  const already = user ? await svc.isMember(group.id, user.id) : false;
  return (
    <div className="mx-auto mt-10 max-w-md card text-center">
      <p className="text-4xl">{svc.groupIcon(group.type)}</p>
      <h1 className="h1 mt-2">Join &ldquo;{group.name}&rdquo;</h1>
      <p className="muted mt-1">{members.map((m) => svc.displayName(m)).join(", ")}</p>
      {user?.name ? (
        <form action={joinGroupAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button className="btn w-full">{already ? "Open group" : `Join as ${user.name}`}</button>
        </form>
      ) : (
        <div className="mt-6 text-left">
          <p className="mb-3 text-sm text-slate-600">Enter your email — we&apos;ll send a magic link that signs you in and brings you back here.</p>
          <ActionForm action={requestLogin} submitLabel="Send my magic link">
            <input type="hidden" name="next" value={`/invite/${token}`} />
            <input name="email" type="email" required placeholder="you@example.com" className="input" />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
