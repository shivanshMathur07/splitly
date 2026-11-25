// Demo data used by `npm run setup` / `npm run seed`.
import { get, run } from "../src/lib/db";
import * as svc from "../src/lib/services";

const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const cat = async (name: string) => (await get<{ id: number }>("SELECT id FROM categories WHERE name = ?", name))?.id ?? 1;

export async function seedDemo(ownerEmail = "shivansh@example.com") {
  const mk = async (email: string, name: string) => {
    const u = await svc.findOrCreateUser(email, name);
    await run("UPDATE users SET joined_at = COALESCE(joined_at, utc_now()) WHERE id = ?", u.id);
    return u.id;
  };
  const me = await mk(ownerEmail, "Shivansh");
  const asha = await mk("asha@example.com", "Asha");
  const rahul = await mk("rahul@example.com", "Rahul");
  const meera = await mk("meera@example.com", "Meera");

  // Trip group with every split type
  const goa = await svc.createGroup(me, { name: "Goa trip", type: "trip", currency: "INR", simplify: true });
  for (const u of [asha, rahul, meera]) await svc.addMember(goa, u, me);
  const all4 = [me, asha, rahul, meera];
  const add = async (actor: number, groupId: number | null, e: Omit<svc.ExpenseInput, "groupId">) => await svc.createExpense(actor, { groupId, ...e });

  await add(me, goa, {
    description: "Villa booking", amount: 2400000, currency: "INR", date: daysAgo(40), categoryId: await cat("Hotels"),
    splitType: "equal", participants: all4.map((userId) => ({ userId, value: 0 })), payers: [{ userId: me, paid: 2400000 }], seed: 1,
  });
  await add(asha, goa, {
    description: "Flights BLR → GOI", amount: 1859900, currency: "INR", date: daysAgo(41), categoryId: await cat("Flights"),
    splitType: "exact",
    participants: [{ userId: me, value: 465000 }, { userId: asha, value: 465000 }, { userId: rahul, value: 464900 }, { userId: meera, value: 465000 }],
    payers: [{ userId: asha, paid: 1859900 }], seed: 2,
  });
  await add(rahul, goa, {
    description: "Seafood dinner", amount: 640000, currency: "INR", date: daysAgo(38), categoryId: await cat("Dining out"),
    splitType: "percent",
    participants: [{ userId: me, value: 3000 }, { userId: asha, value: 2000 }, { userId: rahul, value: 3000 }, { userId: meera, value: 2000 }],
    payers: [{ userId: rahul, paid: 640000 }], seed: 3,
  });
  await add(meera, goa, {
    description: "Scooter rentals", amount: 360000, currency: "INR", date: daysAgo(39), categoryId: await cat("Cabs & rides"),
    splitType: "shares", participants: [{ userId: me, value: 100 }, { userId: asha, value: 100 }, { userId: rahul, value: 200 }, { userId: meera, value: 200 }],
    payers: [{ userId: meera, paid: 360000 }], seed: 4,
  });
  await add(me, goa, {
    description: "Groceries & drinks", amount: 412550, currency: "INR", date: daysAgo(37), categoryId: await cat("Groceries"),
    splitType: "adjustment", participants: [{ userId: me, value: 0 }, { userId: asha, value: 0 }, { userId: rahul, value: 50000 }, { userId: meera, value: 0 }],
    payers: [{ userId: me, paid: 212550 }, { userId: asha, paid: 200000 }], seed: 5,
  });
  await add(asha, goa, {
    description: "Parasailing", amount: 12000, currency: "USD", date: daysAgo(36), categoryId: await cat("Sports"),
    splitType: "equal", participants: [asha, rahul, meera].map((userId) => ({ userId, value: 0 })), payers: [{ userId: asha, paid: 12000 }], seed: 6,
  });
  await svc.recordPayment(rahul, { groupId: goa, from: rahul, to: me, amount: 300000, currency: "INR", date: daysAgo(30) });

  // Flat group, monthly bills
  const flat = await svc.createGroup(me, { name: "Flat 302", type: "home", currency: "INR", simplify: false });
  await svc.addMember(flat, asha, me);
  for (const [i, m] of [[60, "Rent"], [30, "Rent"], [2, "Rent"]].entries()) {
    await add(me, flat, {
      description: `${m[1]} — month ${i + 1}`, amount: 3600000, currency: "INR", date: daysAgo(m[0] as number), categoryId: await cat("Rent"),
      splitType: "equal", participants: [me, asha].map((userId) => ({ userId, value: 0 })), payers: [{ userId: me, paid: 3600000 }], seed: 10 + i,
    });
  }
  await add(asha, flat, {
    description: "Electricity bill", amount: 284733, currency: "INR", date: daysAgo(12), categoryId: await cat("Electricity"),
    splitType: "equal", participants: [me, asha].map((userId) => ({ userId, value: 0 })), payers: [{ userId: asha, paid: 284733 }], seed: 20,
  });
  await add(asha, flat, {
    description: "Wi-Fi", amount: 99900, currency: "INR", date: daysAgo(10), categoryId: await cat("Internet & phone"),
    splitType: "equal", participants: [me, asha].map((userId) => ({ userId, value: 0 })), payers: [{ userId: asha, paid: 99900 }], seed: 21,
  });

  // Friend-to-friend (no group)
  await svc.makeFriends(me, meera);
  await add(meera, null, {
    description: "Movie night", amount: 98000, currency: "INR", date: daysAgo(5), categoryId: await cat("Movies & events"),
    splitType: "equal", participants: [me, meera].map((userId) => ({ userId, value: 0 })), payers: [{ userId: meera, paid: 98000 }], seed: 30,
  });
  return { ownerEmail, groups: [goa, flat] };
}
