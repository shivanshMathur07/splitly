import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { devMailboxEnabled } from "@/lib/mail";
import { signOut } from "@/app/actions";
import { Avatar } from "./ui";
import { AddExpenseFab, BottomTabBar, DesktopNavLinks, MobileTopBar } from "./shell/nav-client";

export async function Nav() {
  const user = await getCurrentUser();
  const devMailbox = devMailboxEnabled();
  const signedIn = Boolean(user?.name);
  return (
    <>
      {/* Desktop header (md and up) — unchanged layout, now with an active link state. */}
      <header className="sticky top-0 z-20 hidden border-b border-slate-200 bg-white/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">÷</span>
            Splitly
          </Link>
          {signedIn && <DesktopNavLinks />}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {devMailbox && (
              <Link href="/dev/mailbox" className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100">
                📬 Dev mailbox
              </Link>
            )}
            {user ? (
              <>
                <Link href="/profile" className="flex items-center gap-2 text-slate-700">
                  <Avatar id={user.id} name={user.name || user.email} size={28} />
                  <span>{user.name || user.email}</span>
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

      {/* Mobile chrome (below md). */}
      <MobileTopBar user={user ? { id: user.id, name: user.name ?? "", email: user.email } : null} devMailbox={devMailbox} />
      {signedIn && (
        <>
          <BottomTabBar />
          <AddExpenseFab />
        </>
      )}
    </>
  );
}
