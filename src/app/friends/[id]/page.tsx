import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { formatMoney } from "@/lib/money";
import { settleFriendAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ExpenseList } from "@/components/expense-list";
import { Avatar } from "@/components/ui";
import { SetTitle } from "@/components/shell/page-title";
import { UpiPayButton } from "@/components/upi-pay";
import { UpiMissing } from "@/components/upi-missing";
import { buildUpiUri, isValidVpa, upiNote } from "@/lib/upi";

export default async function FriendPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const friend = await svc.getUser(Number(id));
  if (!friend || !await svc.areFriends(user.id, friend.id)) notFound();
  const bal = (await svc.friendBalances(user.id)).get(friend.id) ?? {};
  const expenses = await svc.listSharedExpenses(user.id, friend.id);
  const name = svc.displayName(friend);
  const friendUpi = (await svc.upiProfiles([friend.id])).get(friend.id);
  return (
    <div className="space-y-4 md:space-y-6">
      <SetTitle title={name} />
      <div className="flex items-center gap-3 md:gap-4">
        <Avatar id={friend.id} name={name} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="h1 truncate">{name}</h1>
          <p className="muted truncate">{friend.email}{!friend.joined_at && " · hasn't signed in yet"}</p>
        </div>
        <Link href="/expenses/new" className="btn hidden md:inline-flex">Add expense</Link>
      </div>
      <section className="card space-y-3">
        <h2 className="h2">Balance</h2>
        {Object.keys(bal).length === 0 && <p className="text-sm text-slate-500">You&apos;re all settled up with {name}.</p>}
        {Object.entries(bal).map(([c, v]) => (
          <div key={c} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
            <p className="flex-1 text-sm">
              {v > 0 ? <>{name} owes you </> : <>You owe {name} </>}
              <b className={`money ${v > 0 ? "text-emerald-600" : "text-orange-600"}`}>{formatMoney(Math.abs(v), c)}</b>
              <span className="text-xs text-slate-400"> (across all groups)</span>
            </p>
            <ActionForm action={settleFriendAction} submitLabel="Settle up" submitClassName="btn btn-sm" className="flex items-center gap-2">
              <input type="hidden" name="friendId" value={friend.id} />
              <input type="hidden" name="currency" value={c} />
            </ActionForm>
            {v < 0 && c === "INR" && (
              <div className="basis-full">
                {friendUpi?.upi_id && isValidVpa(friendUpi.upi_id) ? (
                  <UpiPayButton
                    uri={buildUpiUri({ vpa: friendUpi.upi_id, name: friendUpi.upi_name || name, amountCents: -v, note: upiNote(`${svc.displayName(user)} settling up`) })}
                    payee={friendUpi.upi_name || name}
                    vpa={friendUpi.upi_id}
                    amountCents={-v}
                    kind="friend"
                    hidden={{ friendId: friend.id }}
                    className="btn w-full md:w-auto"
                  />
                ) : (
                  <UpiMissing name={name} userId={friend.id} />
                )}
              </div>
            )}
          </div>
        ))}
        <p className="text-xs text-slate-400">Settle up records one payment in each group you share (and one for non-group expenses), so group balances stay correct.</p>
      </section>
      <section className="card">
        <h2 className="h2 mb-2">Shared expenses</h2>
        <ExpenseList expenses={expenses} userId={user.id} showGroup />
      </section>
    </div>
  );
}
