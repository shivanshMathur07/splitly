import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { ActivityList } from "@/components/activity-list";
import { Empty } from "@/components/ui";
import { BalanceCards, FriendRows, GroupRows } from "@/components/lists";

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
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Hi {user.name.split(" ")[0]} 👋</h1>
        <div className="hidden gap-2 md:flex">
          <Link href="/groups/new" className="btn-secondary">New group</Link>
          <Link href="/expenses/new" className="btn">Add expense</Link>
        </div>
      </div>

      <BalanceCards currencies={currencies} totals={totals} />

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="h2">Groups</h2>
            <Link href="/groups/new" className="link inline-flex min-h-11 items-center text-sm font-medium md:min-h-0">+ New group</Link>
          </div>
          {groups.length === 0 ? (
            <Empty icon="🏠" title="No groups yet" action={<Link href="/groups/new" className="btn btn-sm">Create a group</Link>}>
              Create one for your flat, a trip or your partner.
            </Empty>
          ) : (
            <GroupRows groups={groups} nets={groupNets} />
          )}
        </section>

        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="h2">Friends</h2>
            <Link href="/friends" className="link inline-flex min-h-11 items-center text-sm font-medium md:min-h-0">See all</Link>
          </div>
          {friends.length === 0 ? (
            <Empty icon="👋" title="No friends yet" action={<Link href="/friends" className="btn btn-sm">Invite someone</Link>}>
              Add a friend by email to split one-off bills.
            </Empty>
          ) : (
            <FriendRows friends={friends.slice(0, 8)} balances={fb} />
          )}
        </section>
      </div>

      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">Recent activity</h2>
          <Link href="/activity" className="link inline-flex min-h-11 items-center text-sm font-medium md:min-h-0">See all</Link>
        </div>
        <ActivityList items={activity} userId={user.id} />
      </section>
    </div>
  );
}

function Landing() {
  return (
    <div className="mx-auto mt-4 max-w-3xl text-center md:mt-10">
      <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-600 text-3xl text-white">÷</span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Split bills. Settle up. See where it went.</h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-slate-600 md:text-lg">
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
