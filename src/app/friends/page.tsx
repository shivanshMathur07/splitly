import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { addFriendAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Empty } from "@/components/ui";
import { FriendRows } from "@/components/lists";
import { SheetButton } from "@/components/bottom-sheet";

export default async function FriendsPage() {
  const user = await requireUser();
  const friends = await svc.listFriends(user.id);
  const fb = await svc.friendBalances(user.id);
  const inviteForm = (
    <ActionForm action={addFriendAction} submitLabel="Send invite" submitClassName="btn w-full sm:w-auto">
      <input name="name" placeholder="Name (optional)" className="input" autoComplete="off" />
      <input name="email" type="email" inputMode="email" autoComplete="off" required placeholder="friend@example.com" className="input" />
    </ActionForm>
  );
  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h1 className="h1">Friends</h1>
          <SheetButton label="Invite" title="Invite a friend" className="btn btn-sm md:hidden" testId="sheet-invite-friend" icon={<UserPlus size={16} />}>
            <p className="muted mb-3">They&apos;ll get a magic link to sign in — no password.</p>
            {inviteForm}
          </SheetButton>
        </div>
        {friends.length === 0 ? (
          <Empty icon="👋" title="No friends yet">Invite someone with their email address.</Empty>
        ) : (
          <FriendRows friends={friends} balances={fb} showEmail />
        )}
      </section>
      <section className="card hidden h-fit md:block">
        <h2 className="h2">Invite a friend</h2>
        <p className="muted mb-3">They&apos;ll get a magic link to sign in — no password.</p>
        {inviteForm}
      </section>
    </div>
  );
}
