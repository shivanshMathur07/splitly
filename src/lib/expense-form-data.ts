import type { UserRow } from "./services";
import * as svc from "./services";
import type { GroupOption, Person } from "@/components/expense-form";

/** Data the expense form needs for a given user. */
export async function expenseFormData(user: UserRow) {
  const me: Person = { id: user.id, name: svc.displayName(user) };
  const groups: GroupOption[] = [];
  for (const g of await svc.listGroups(user.id))
    groups.push({
      id: g.id,
      name: g.name,
      currency: g.default_currency,
      members: (await svc.groupMembers(g.id)).map((m) => ({ id: m.id, name: svc.displayName(m) })),
    });
  const friends: Person[] = (await svc.listFriends(user.id)).map((f) => ({ id: f.id, name: svc.displayName(f) }));
  return { me, groups, friends, categories: await svc.listCategories() };
}
