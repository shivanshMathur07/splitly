import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { formatMoney } from "@/lib/money";
import { ActivityList } from "@/components/activity-list";
import { Avatar, BalanceLine, Empty } from "@/components/ui";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <Landing />;
  if (!user.name) redirect("/welcome");

  const totals = await svc.userTotals(user.id);
  const groups = await svc.listGroups(user.id);
  const friends = await svc.listFriends(user.id);
  const fb = await svc.friendBalances(user.id);
  const activity = await svc.listActivity(user.id, { limit: 8 });
  const groupNets = new Map(await Promise.all(groups.map(async (g) => [g.id, await svc.groupNetForUser(g.id, user.id)] as const)));
  const currencies = Object.keys(totals).length ? Object.keys(totals) : [user.default_currency];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Hi {user.name.split(" ")[0]} 👋</h1>
        <div className="flex gap-2">
          <Link href="/groups/new" className="btn-secondary">New group</Link>
          <Link href="/expenses/new" className="btn">Add expense</Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {currencies.map((c) => {
          const t = totals[c] ?? { owed: 0, owe: 0 };
          return (
            <div key={c} className="card sm:col-span-3">
              <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                <div>
                  <p className="label">Total balance ({c})</p>
                  <p className={`text-xl font-semibold ${t.owed - t.owe >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
                    {t.owed - t.owe < 0 ? "−" : ""}{formatMoney(Math.abs(t.owed - t.owe), c)}
                  </p>
                </div>
                <div>
                  <p className="label">You owe</p>
                  <p className="text-xl font-semibold text-orange-600">{formatMoney(t.owe, c)}</p>
                </div>
                <div>
                  <p className="label">You are owed</p>
                  <p className="text-xl font-semibold text-emerald-600">{formatMoney(t.owed, c)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Groups</h2>
            <Link href="/groups/new" className="link text-sm">+ New group</Link>
          </div>
          {groups.length === 0 ? (
            <Empty title="No groups yet">Create one for your flat, a trip or your partner.</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {groups.map((g) => {
                const net = groupNets.get(g.id) ?? {};
                const entries = Object.entries(net);
                return (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3 hover:bg-slate-50">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-xl">{svc.groupIcon(g.type)}</span>
                      <div className="flex-1">
                        <p className="font-medium">{g.name}</p>
                        <p className="text-xs text-slate-500">{g.member_count} members{g.simplify_debts ? " · simplified" : ""}</p>
                      </div>
                      <div className="text-right text-sm">
                        {entries.length === 0 ? (
                          <span className="text-slate-400">settled up</span>
                        ) : (
                          entries.map(([c, v]) => (
                            <p key={c} className={v > 0 ? "text-emerald-700" : "text-orange-700"}>
                              {v > 0 ? "you are owed " : "you owe "}<b>{formatMoney(Math.abs(v), c)}</b>
                            </p>
                          ))
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="h2">Friends</h2>
            <Link href="/friends" className="link text-sm">See all</Link>
          </div>
          {friends.length === 0 ? (
            <Empty title="No friends yet"><Link className="link" href="/friends">Invite someone by email</Link></Empty>
          ) : (
            <ul className="space-y-2">
              {friends.slice(0, 8).map((f) => {
                const bal = fb.get(f.id) ?? {};
                const entries = Object.entries(bal);
                return (
                  <li key={f.id}>
                    <Link href={`/friends/${f.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-slate-50">
                      <Avatar id={f.id} name={svc.displayName(f)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{svc.displayName(f)}</p>
                        {entries.length === 0 ? <BalanceLine cents={0} currency="INR" /> : entries.map(([c, v]) => <div key={c}><BalanceLine cents={v} currency={c} /></div>)}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Recent activity</h2>
          <Link href="/activity" className="link text-sm">See all</Link>
        </div>
        <ActivityList items={activity} userId={user.id} />
      </section>
    </div>
  );
}

function Landing() {
  return (
    <div className="mx-auto mt-10 max-w-3xl text-center">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-3xl text-white">÷</span>
      <h1 className="mt-6 text-4xl font-bold text-slate-900">Split bills. Settle up. See where it went.</h1>
      <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
        Splitly keeps track of shared expenses with friends, flatmates and travel buddies — to the last paisa — and tells you the fewest payments needed to get everyone even.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/login" className="btn px-6 py-3 text-base">Get started — it&apos;s passwordless</Link>
      </div>
      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {[
          ["✉️", "Magic-link invites", "Invite friends by email; they join with one click."],
          ["🧮", "Fair splits", "Equal, exact, percent, shares or adjustments with exact rounding."],
          ["📊", "Insights", "Spending by category and by person, for any date range."],
        ].map(([icon, title, body]) => (
          <div key={title} className="card">
            <p className="text-2xl">{icon}</p>
            <p className="mt-2 font-semibold">{title}</p>
            <p className="muted mt-1">{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
