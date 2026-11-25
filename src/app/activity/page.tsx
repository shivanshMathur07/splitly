import { requireUser } from "@/lib/auth";
import * as svc from "@/lib/services";
import { ActivityList } from "@/components/activity-list";

export default async function ActivityPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-2xl card">
      <h1 className="h1 mb-4">Activity</h1>
      <ActivityList items={await svc.listActivity(user.id, { limit: 200 })} userId={user.id} />
    </div>
  );
}
