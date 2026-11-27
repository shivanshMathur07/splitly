import Link from "next/link";
import { notFound } from "next/navigation";
import { appUrl, requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { CURRENCIES, formatMoney } from "@/lib/money";
import { inviteToGroupAction, regenerateInviteAction, updateGroupAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ExpenseList } from "@/components/expense-list";
import { SettlePanel } from "@/components/settle-panel";
import { ActivityList } from "@/components/activity-list";
import { CopyButton } from "@/components/copy-button";
import { Avatar } from "@/components/ui";
import { SheetButton } from "@/components/bottom-sheet";
import { ShareButton } from "@/components/share-button";
import { SetTitle } from "@/components/shell/page-title";
import { formatDateTimeIST } from "@/lib/time";
import { ChartPie, UserPlus } from "lucide-react";

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { deleted } = await searchParams;
  const group = await svc.getGroupForUser(Number(id), user.id);
  if (!group) notFound();
  const members = await svc.groupMembers(group.id);
  const balances = await svc.groupBalances(group.id);
  const expenses = await svc.listGroupExpenses(group.id, { includeDeleted: deleted === "1" });
  const activity = await svc.listActivity(user.id, { groupId: group.id, limit: 10 });
  const upi = await svc.upiProfiles(members.map((m) => m.id));
  const inviteUrl = `${await appUrl()}/invite/${group.invite_token}`;
  const invite = { url: inviteUrl, expiresAt: svc.groupInviteExpiresAt(group), expired: svc.isGroupInviteExpired(group) };

  return (
    <div className="space-y-4 md:space-y-6">
      <SetTitle title={group.name} />
      <div className="flex items-center gap-3 md:gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-2xl md:h-14 md:w-14 md:text-3xl">{svc.groupIcon(group.type)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="h1 truncate">{group.name}</h1>
          <p className="muted">{members.length} members · default {group.default_currency}</p>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link href={`/insights?group=${group.id}`} className="btn-secondary">📊 Charts</Link>
          <Link href={`/expenses/new?group=${group.id}`} className="btn">Add expense</Link>
        </div>
      </div>

      {/* Mobile: quick actions + swipeable member balances. */}
      <div className="flex gap-2 md:hidden">
        <SheetButton label="Invite" title="Invite friends" className="btn-secondary flex-1" testId="sheet-invite" icon={<UserPlus size={18} />}>
          <InviteContent groupId={group.id} groupName={group.name} invite={invite} />
        </SheetButton>
        <Link href={`/insights?group=${group.id}`} className="btn-secondary flex-1"><ChartPie size={18} /> Charts</Link>
      </div>
      <ul className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 md:hidden" data-testid="member-chips">
        {members.map((m) => {
          const nets = balances.map((b) => ({ c: b.currency, v: b.net[m.id] ?? 0 })).filter((x) => x.v !== 0);
          return (
            <li key={m.id} className="flex w-36 shrink-0 snap-start items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5">
              <Avatar id={m.id} name={svc.displayName(m)} size={32} />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{m.id === user.id ? "You" : svc.displayName(m)}</p>
                {nets.length === 0 ? (
                  <p className="text-xs text-slate-400">{m.joined_at ? "settled up" : "invited"}</p>
                ) : (
                  nets.slice(0, 1).map((n) => (
                    <p key={n.c} className={`money truncate text-xs font-bold ${n.v > 0 ? "text-emerald-600" : "text-orange-600"}`}>
                      {n.v > 0 ? "+" : "−"}{formatMoney(Math.abs(n.v), n.c)}
                    </p>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 md:space-y-6 lg:col-span-2">
          <section className="card">
            <SettlePanel group={group} balances={balances} members={members} userId={user.id} upi={upi} />
          </section>
          <section className="card">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="h2">Expenses</h2>
              <Link href={deleted === "1" ? `/groups/${group.id}` : `/groups/${group.id}?deleted=1`} className="text-xs text-slate-500 hover:underline">
                {deleted === "1" ? "Hide deleted" : "Show deleted"}
              </Link>
            </div>
            <ExpenseList expenses={expenses} userId={user.id} />
          </section>
        </div>

        <div className="min-w-0 space-y-4 md:space-y-6">
          <section className="card hidden md:block">
            <h2 className="h2 mb-3">Balances</h2>
            <ul className="space-y-2">
              {members.map((m) => {
                const nets = balances.map((b) => ({ c: b.currency, v: b.net[m.id] ?? 0 })).filter((x) => x.v !== 0);
                return (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar id={m.id} name={svc.displayName(m)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {svc.displayName(m)}
                        {m.id === user.id && " (you)"}
                        {!m.joined_at && <span className="ml-1 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500">invited</span>}
                      </p>
                      {nets.length === 0 ? (
                        <p className="text-xs text-slate-400">settled up</p>
                      ) : (
                        nets.map((n) => (
                          <p key={n.c} className={`money text-xs ${n.v > 0 ? "text-emerald-700" : "text-orange-700"}`}>
                            {n.v > 0 ? "gets back " : "owes "}<b>{formatMoney(Math.abs(n.v), n.c)}</b>
                          </p>
                        ))
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card hidden space-y-4 md:block">
            <h2 className="h2">Invite friends</h2>
            <InviteContent groupId={group.id} groupName={group.name} invite={invite} />
          </section>

          <section className="card">
            <details>
              <summary className="h2 cursor-pointer">Group settings</summary>
              <ActionForm action={updateGroupAction} submitLabel="Save" className="mt-3 space-y-3">
                <input type="hidden" name="groupId" value={group.id} />
                <input name="name" defaultValue={group.name} className="input" required />
                <select name="type" defaultValue={group.type} className="input">
                  {svc.GROUP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
                <select name="currency" defaultValue={group.default_currency} className="input">
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="simplify" defaultChecked={Boolean(group.simplify_debts)} className="accent-brand-600" /> Simplify debts
                </label>
              </ActionForm>
            </details>
          </section>

          <section className="card">
            <h2 className="h2 mb-3">Group activity</h2>
            <ActivityList items={activity} userId={user.id} />
          </section>
        </div>
      </div>
    </div>
  );
}

function InviteContent({ groupId, groupName, invite }: { groupId: number; groupName: string; invite: { url: string; expiresAt: string; expired: boolean } }) {
  const inviteUrl = invite.url;
  return (
    <div className="space-y-4">
      <ActionForm action={inviteToGroupAction} submitLabel="Send magic link" className="space-y-2" submitClassName="btn w-full sm:w-auto">
        <input type="hidden" name="groupId" value={groupId} />
        <input name="name" placeholder="Name (optional)" className="input" autoComplete="off" />
        <input name="email" type="email" inputMode="email" autoComplete="off" required placeholder="friend@example.com" className="input" />
        <p className="text-xs text-slate-400">They get a one-time sign-in link that works for 7 days.</p>
      </ActionForm>
      <div>
        <p className="label">Or share the invite link</p>
        {invite.expired ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800" data-testid="invite-expired">
            This link expired on {formatDateTimeIST(invite.expiresAt)}. Get a new one to invite people.
          </p>
        ) : (
          <>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl} className="input min-w-0 font-mono text-xs md:text-xs" data-testid="invite-link" aria-label="Invite link" />
              <CopyButton text={inviteUrl} />
            </div>
            <div className="mt-2 md:hidden">
              <ShareButton url={inviteUrl} title={`Join ${groupName} on Splitly`} text={`Join "${groupName}" on Splitly to split expenses with me.`} />
            </div>
            <p className="mt-2 text-xs text-slate-400" data-testid="invite-expiry">Link works until {formatDateTimeIST(invite.expiresAt)}</p>
          </>
        )}
        <form action={regenerateInviteAction} className="mt-1">
          <input type="hidden" name="groupId" value={groupId} />
          <button className={invite.expired ? "btn-secondary mt-2 w-full sm:w-auto" : "min-h-11 text-xs text-slate-500 hover:underline md:min-h-0"}>
            {invite.expired ? "Get a new link (7 days)" : "Reset link (new 7 days)"}
          </button>
        </form>
      </div>
    </div>
  );
}
