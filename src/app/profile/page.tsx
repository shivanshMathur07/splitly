import { requireUser } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md card">
      <h1 className="h1">Your profile</h1>
      <p className="muted mt-1">{user.email}</p>
      <ProfileForm name={user.name ?? ""} currency={user.default_currency} submitLabel="Save" />
    </div>
  );
}
