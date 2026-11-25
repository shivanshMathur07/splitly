import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { devMailboxEnabled } from "@/lib/mail";
import { signOut } from "@/app/actions";
import { Avatar } from "./ui";

export async function Nav() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">÷</span>
          Splitly
        </Link>
        {user?.name && (
          <nav className="flex flex-1 flex-wrap items-center gap-1 text-sm">
            {[
              ["/", "Dashboard"],
              ["/friends", "Friends"],
              ["/activity", "Activity"],
              ["/insights", "Insights"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                {label}
              </Link>
            ))}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {devMailboxEnabled() && (
            <Link href="/dev/mailbox" className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
              📬 Dev mailbox
            </Link>
          )}
          {user ? (
            <>
              <Link href="/profile" className="flex items-center gap-2 text-slate-700">
                <Avatar id={user.id} name={user.name || user.email} size={28} />
                <span className="hidden sm:inline">{user.name || user.email}</span>
              </Link>
              <form action={signOut}>
                <button className="text-slate-500 hover:text-slate-800">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
