import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/auth";
import { ProfileForm } from "@/components/profile-form";

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-md card">
      <h1 className="h1">Welcome to Splitly 👋</h1>
      <p className="muted mt-1">Signed in as {user.email}. What should friends see you as?</p>
      <ProfileForm name={user.name ?? ""} currency={user.default_currency} next={safeNext(next)} submitLabel="Continue" />
    </div>
  );
}
