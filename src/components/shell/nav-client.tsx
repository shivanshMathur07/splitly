"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Activity, ChartPie, House, LogOut, Mail, Plus, UserRound, Users, UsersRound } from "lucide-react";
import { signOut } from "@/app/actions";
import { Avatar } from "@/components/ui";
import { usePageTitle } from "./page-title";

export const NAV = [
  { href: "/", label: "Dashboard", short: "Home", icon: House },
  { href: "/groups", label: "Groups", short: "Groups", icon: UsersRound },
  { href: "/friends", label: "Friends", short: "Friends", icon: Users },
  { href: "/activity", label: "Activity", short: "Activity", icon: Activity },
  { href: "/insights", label: "Insights", short: "Insights", icon: ChartPie },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/groups") return pathname === "/groups" || /^\/groups\/(\d+|new)/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop (md+) header links with an active state. */
export function DesktopNavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 items-center gap-1 text-sm" aria-label="Main">
      {NAV.filter((n) => n.href !== "/groups").map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 font-medium ${active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

type MenuUser = { id: number; name: string; email: string };

/** Mobile (< md) sticky top bar: logo, page title, avatar menu. */
export function MobileTopBar({ user, devMailbox }: { user: MenuUser | null; devMailbox: boolean }) {
  const title = usePageTitle();
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur md:hidden" data-testid="mobile-topbar">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link href="/" aria-label="Splitly home" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">÷</Link>
        <p className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">{title}</p>
        {user ? (
          <AvatarMenu user={user} devMailbox={devMailbox} />
        ) : (
          <Link href="/login" className="btn btn-sm">Sign in</Link>
        )}
      </div>
    </header>
  );
}

function AvatarMenu({ user, devMailbox }: { user: MenuUser; devMailbox: boolean }) {
  const pathname = usePathname();
  // Remember where the menu was opened so navigating away closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    const next = typeof v === "function" ? v(open) : v;
    setOpenAt(next ? pathname : null);
  };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpenAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenAt(null); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const display = user.name || user.email;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-11 w-11 place-items-center rounded-full"
        data-testid="avatar-menu"
      >
        <Avatar id={user.id} name={display} size={34} />
      </button>
      {open && (
        <div role="menu" className="animate-fade-in absolute right-0 top-12 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-3 border-b border-slate-100 p-4">
            <Avatar id={user.id} name={display} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{display}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <Link role="menuitem" href="/profile" className="flex min-h-12 items-center gap-3 px-4 text-sm text-slate-700 active:bg-slate-50">
            <UserRound size={18} className="text-slate-400" /> Profile
          </Link>
          {devMailbox && (
            <Link role="menuitem" href="/dev/mailbox" className="flex min-h-12 items-center gap-3 px-4 text-sm text-amber-700 active:bg-amber-50">
              <Mail size={18} /> Dev mailbox
            </Link>
          )}
          <form action={signOut} className="border-t border-slate-100">
            <button role="menuitem" className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-rose-600 active:bg-rose-50">
              <LogOut size={18} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Mobile (< md) fixed bottom tab bar. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      data-testid="bottom-tabs"
    >
      <ul className="grid grid-cols-5">
        {NAV.map(({ href, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? "text-brand-700" : "text-slate-500"}`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? "bg-brand-100" : ""}`}>
                  <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                </span>
                {short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const FAB_HIDDEN = [/^\/expenses\/new/, /^\/expenses\/\d+\/edit/, /^\/profile/, /^\/welcome/, /^\/login/, /^\/dev/];

/** Mobile floating "Add expense" button that sits above the tab bar. */
export function AddExpenseFab() {
  const pathname = usePathname();
  if (FAB_HIDDEN.some((re) => re.test(pathname))) return null;
  const group = pathname.match(/^\/groups\/(\d+)/)?.[1];
  const href = group ? `/expenses/new?group=${group}` : "/expenses/new";
  return (
    <Link
      href={href}
      aria-label="Add expense"
      data-testid="fab-add-expense"
      className="fixed right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-brand-600 pl-4 pr-5 font-semibold text-white shadow-lg shadow-brand-900/25 active:bg-brand-700 md:hidden"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.875rem)" }}
    >
      <Plus size={22} strokeWidth={2.5} /> Expense
    </Link>
  );
}
