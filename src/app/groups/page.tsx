import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { GroupRows } from "@/components/lists";
import { Empty } from "@/components/ui";

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await svc.listGroups(user.id);
  const nets = new Map(await Promise.all(groups.map(async (g) => [g.id, await svc.groupNetForUser(g.id, user.id)] as const)));
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="h1">Groups</h1>
        <Link href="/groups/new" className="btn btn-sm"><Plus size={16} /> New group</Link>
      </div>
      <section className="card">
        {groups.length === 0 ? (
          <Empty icon="🏠" title="No groups yet" action={<Link href="/groups/new" className="btn btn-sm">Create a group</Link>}>
            Create one for your flat, a trip or your partner.
          </Empty>
        ) : (
          <GroupRows groups={groups} nets={nets} />
        )}
      </section>
    </div>
  );
}
