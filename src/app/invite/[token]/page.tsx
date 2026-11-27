import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { joinGroupAction, requestLogin } from "@/app/actions";
import { ActionForm } from "@/components/action-form";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await svc.getInvite(token);
  if (!invite) notFound();
  const { group } = invite;
  const user = await getCurrentUser();
  const already = user ? await svc.isMember(group.id, user.id) : false;
  if (invite.expired && !already)
    return (
      <div className="mx-auto mt-10 max-w-md card text-center" data-testid="invite-link-expired">
        <p className="text-4xl">⏳</p>
        <h1 className="h1 mt-2">This invite link has expired</h1>
        <p className="muted mt-2">
          Invite links work for 7 days. Ask someone in the group to send you a new link — they can get one from the
          group&apos;s Invite section.
        </p>
        <Link href={user ? "/" : "/login"} className="btn mt-6 w-full">{user ? "Go to Splitly" : "Sign in"}</Link>
      </div>
    );
  const members = await svc.groupMembers(group.id);
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
