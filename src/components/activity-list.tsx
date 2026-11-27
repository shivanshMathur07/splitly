import Link from "next/link";
import type { ActivityRow } from "@/lib/services";
import { displayName } from "@/lib/services";
import { Avatar, Empty, timeAgo } from "./ui";

const ICON: Record<string, string> = {
  expense_added: "➕",
  expense_updated: "✏️",
  expense_deleted: "🗑️",
  expense_restored: "♻️",
  payment: "💸",
  group_created: "👥",
  group_updated: "⚙️",
  member_added: "🙋",
  friend_added: "🤝",
};

export function ActivityList({ items, userId }: { items: ActivityRow[]; userId: number }) {
  if (!items.length) return <Empty icon="🕒" title="Nothing here yet">Expenses, payments and new members will show up here.</Empty>;
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const who = a.actor_id === userId ? "You" : displayName({ name: a.actor_name, email: a.actor_email });
        const body = (
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <Avatar id={a.actor_id} name={displayName({ name: a.actor_name, email: a.actor_email })} size={34} />
              <span className="absolute -bottom-1 -right-1 text-xs">{ICON[a.type] ?? "•"}</span>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="break-words text-slate-700">
                <b>{who}</b> {a.summary}
                {a.group_name && <span className="text-slate-500"> in {a.group_name}</span>}
              </p>
              <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
            </div>
          </div>
        );
        const href = a.expense_id ? `/expenses/${a.expense_id}` : a.group_id ? `/groups/${a.group_id}` : null;
        return <li key={a.id}>{href ? <Link href={href} className="block rounded-lg p-1.5 hover:bg-slate-50 active:bg-slate-50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}
