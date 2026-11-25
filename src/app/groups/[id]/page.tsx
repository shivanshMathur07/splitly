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
  const inviteUrl = `${await appUrl()}/invite/${group.invite_token}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-3xl">{svc.groupIcon(group.type)}</span>
        <div className="flex-1">
          <h1 className="h1">{group.name}</h1>
          <p className="muted">{members.length} members · default {group.default_currency}</p>
        </div>
        <Link href={`/insights?group=${group.id}`} className="btn-secondary">📊 Charts</Link>
        <Link href={`/expenses/new?group=${group.id}`} className="btn">Add expense</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <SettlePanel group={group} balances={balances} members={members} userId={user.id} />
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

        <div className="space-y-6">
          <section className="card">
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
                          <p key={n.c} className={`text-xs ${n.v > 0 ? "text-emerald-700" : "text-orange-700"}`}>
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

          <section className="card space-y-4">
            <h2 className="h2">Invite friends</h2>
            <ActionForm action={inviteToGroupAction} submitLabel="Send magic link" className="space-y-2">
              <input type="hidden" name="groupId" value={group.id} />
              <input name="name" placeholder="Name (optional)" className="input" />
              <input name="email" type="email" required placeholder="friend@example.com" className="input" />
            </ActionForm>
            <div>
              <p className="label">Or share the invite link</p>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl} className="input font-mono text-xs" data-testid="invite-link" />
                <CopyButton text={inviteUrl} />
              </div>
              <form action={regenerateInviteAction} className="mt-1">
                <input type="hidden" name="groupId" value={group.id} />
                <button className="text-xs text-slate-500 hover:underline">Reset link</button>
              </form>
            </div>
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
