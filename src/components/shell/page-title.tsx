"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Ctx = { title: string | null; setTitle: (t: string | null) => void };
const TitleContext = createContext<Ctx>({ title: null, setTitle: () => {} });

export function TitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <TitleContext.Provider value={{ title, setTitle }}>{children}</TitleContext.Provider>;
}

/** Drop into a page to name it in the mobile top bar (e.g. a group's name). Renders nothing. */
export function SetTitle({ title }: { title: string }) {
  const { setTitle } = useContext(TitleContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
  return null;
}

const FALLBACK: [RegExp, string][] = [
  [/^\/$/, "Dashboard"],
  [/^\/groups\/new/, "New group"],
  [/^\/groups\/\d+/, "Group"],
  [/^\/groups/, "Groups"],
  [/^\/friends\/\d+/, "Friend"],
  [/^\/friends/, "Friends"],
  [/^\/activity/, "Activity"],
  [/^\/insights/, "Insights"],
  [/^\/expenses\/new/, "Add expense"],
  [/^\/expenses\/\d+\/edit/, "Edit expense"],
  [/^\/expenses\/\d+/, "Expense"],
  [/^\/profile/, "Profile"],
  [/^\/dev\/mailbox/, "Dev mailbox"],
  [/^\/login/, "Sign in"],
];

export function usePageTitle() {
  const { title } = useContext(TitleContext);
  const pathname = usePathname();
  return title ?? FALLBACK.find(([re]) => re.test(pathname))?.[1] ?? "Splitly";
}
