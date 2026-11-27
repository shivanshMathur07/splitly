import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";
import * as svc from "@/lib/services";

export default async function ProfilePage() {
  const user = await requireUser();
  const upi = (await svc.upiProfiles([user.id])).get(user.id);
  return (
    <div className="mx-auto max-w-md card">
      <h1 className="h1">Your profile</h1>
      <p className="muted mt-1">{user.email}</p>
      <ProfileForm name={user.name ?? ""} currency={user.default_currency} submitLabel="Save" upi={{ id: upi?.upi_id ?? "", name: upi?.upi_name ?? "" }} />
    </div>
  );
}
