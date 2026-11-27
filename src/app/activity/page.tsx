import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { ActivityList } from "@/components/activity-list";

export default async function ActivityPage() {
  const user = await requireUser();
  return (
    <div className="card mx-auto max-w-2xl">
      <h1 className="h1 mb-4 hidden md:block">Activity</h1>
      <ActivityList items={await svc.listActivity(user.id, { limit: 200 })} userId={user.id} />
    </div>
  );
}
