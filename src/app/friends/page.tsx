import Link from "next/link";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { addFriendAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { Avatar, BalanceLine, Empty } from "@/components/ui";

export default async function FriendsPage() {
  const user = await requireUser();
  const friends = await svc.listFriends(user.id);
  const fb = await svc.friendBalances(user.id);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <h1 className="h1 mb-4">Friends</h1>
        {friends.length === 0 ? (
          <Empty title="No friends yet">Invite someone with their email address.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {friends.map((f) => {
              const entries = Object.entries(fb.get(f.id) ?? {});
              return (
                <li key={f.id}>
                  <Link href={`/friends/${f.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                    <Avatar id={f.id} name={svc.displayName(f)} size={40} />
                    <div className="flex-1">
                      <p className="font-medium">
                        {svc.displayName(f)}
                        {!f.joined_at && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">invited</span>}
                      </p>
                      <p className="text-xs text-slate-500">{f.email}</p>
                    </div>
                    <div className="text-right">
                      {entries.length === 0 ? <BalanceLine cents={0} currency="INR" /> : entries.map(([c, v]) => <div key={c}><BalanceLine cents={v} currency={c} /></div>)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="card h-fit">
        <h2 className="h2">Invite a friend</h2>
        <p className="muted mb-3">They&apos;ll get a magic link to sign in — no password.</p>
        <ActionForm action={addFriendAction} submitLabel="Send invite">
          <input name="name" placeholder="Name (optional)" className="input" />
          <input name="email" type="email" required placeholder="friend@example.com" className="input" />
        </ActionForm>
      </section>
    </div>
  );
}
