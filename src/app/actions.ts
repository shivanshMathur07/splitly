"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkLoginRateLimit, createMagicLink, destroySession, getCurrentUser, requireUser, safeNext, type User } from "@/lib/auth";
import { hitRateLimit } from "@/lib/rate-limit";
import { devMailboxEnabled, linkEmail, MailNotConfiguredError, sendMail } from "@/lib/mail";
import { parseAmount } from "@/lib/money";
import * as svc from "@/lib/services";
import type { SplitType } from "@/lib/split";

export interface FormState {
  error?: string;
  message?: string;
  devMailbox?: boolean;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));
const fail = (e: unknown): FormState => {
  if (e instanceof svc.SplitError) return { error: e.message };
  if (e instanceof MailNotConfiguredError) {
    console.error(e.message);
    return { error: "Email isn't set up on this server yet, so invites can't be sent. (Admin: set the SMTP_* environment variables.)" };
  }
  console.error(e);
  return { error: "Something went wrong. Check the server log." };
};

// ───────── auth ─────────
export async function requestLogin(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, "email").toLowerCase();
  if (!svc.isEmail(email)) return { error: "Enter a valid email address" };
  const limited = await checkLoginRateLimit(email);
  if (limited) return { error: limited };
  const url = await createMagicLink(email, safeNext(str(fd, "next")));
  const mail = linkEmail({
    heading: "Your Splitly sign-in link",
    body: "Click the button below to sign in. No password needed.",
    cta: "Sign in to Splitly",
    url,
  });
  try {
    await sendMail({ to: email, subject: "Sign in to Splitly", ...mail });
  } catch (e) {
    if (e instanceof MailNotConfiguredError) {
      console.error(e.message);
      return { error: "Email isn't set up on this server yet, so sign-in links can't be sent. (Admin: set the SMTP_* environment variables.)" };
    }
    console.error("Failed to send mail", e);
    return { error: "Couldn't send the email. Check your SMTP settings." };
  }
  return { message: `We sent a sign-in link to ${email}.`, devMailbox: devMailboxEnabled() };
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await svc.updateProfile(user.id, str(fd, "name"), str(fd, "currency"));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  const next = str(fd, "next");
  if (next) redirect(safeNext(next));
  return { message: "Saved" };
}

// ───────── invites ─────────
async function sendInvite(inviter: User, invitee: svc.UserRow, group: svc.GroupRow | null) {
  if (await hitRateLimit("invite:user", String(inviter.id), { max: 30, windowSeconds: 60 * 60 }))
    throw new svc.SplitError("You've sent a lot of invites in the last hour. Please try again later.");
  const next = group ? `/groups/${group.id}` : `/friends/${inviter.id}`;
  const url = await createMagicLink(invitee.email, next);
  const who = svc.displayName(inviter);
  const mail = linkEmail({
    heading: group ? `${who} added you to "${group.name}"` : `${who} wants to split expenses with you`,
    body: group
      ? `${who} is using Splitly to track shared expenses in "${group.name}". Click below to sign in and see the group — no password needed.`
      : `${who} added you as a friend on Splitly, a simple way to share bills. Click below to sign in — no password needed.`,
    cta: group ? "Open the group" : "Join Splitly",
    url,
    footer: "This magic link signs you in and expires in 30 minutes. You can always request a new one from the sign-in page.",
  });
  await sendMail({ to: invitee.email, subject: group ? `You've been added to ${group.name} on Splitly` : `${who} invited you to Splitly`, ...mail });
}

/** Parse "Name <a@b.com>, c@d.com" style lists. */
function parseInvitees(raw: string): { email: string; name: string | null }[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*)<([^>]+)>$/);
      return m ? { email: m[2].trim(), name: m[1].trim() || null } : { email: s, name: null };
    });
}

export async function createGroupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  let id: number;
  try {
    const invitees = parseInvitees(str(fd, "members"));
    for (const i of invitees) if (!svc.isEmail(i.email)) return { error: `"${i.email}" isn't a valid email` };
    id = await svc.createGroup(user.id, {
      name: str(fd, "name"),
      type: str(fd, "type") || "other",
      currency: str(fd, "currency") || user.default_currency,
      simplify: fd.get("simplify") === "on",
    });
    const group = await svc.getGroupForUser(id, user.id)!;
    for (const i of invitees) {
      const invitee = await svc.findOrCreateUser(i.email, i.name);
      if (await svc.addMember(id, invitee.id, user.id) && invitee.id !== user.id) await sendInvite(user, invitee, group);
    }
  } catch (e) {
    return fail(e);
  }
  redirect(`/groups/${id}`);
}

export async function inviteToGroupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const group = await svc.getGroupForUser(num(fd, "groupId"), user.id);
    if (!group) return { error: "Group not found" };
    const email = str(fd, "email");
    if (!svc.isEmail(email)) return { error: "Enter a valid email address" };
    const invitee = await svc.findOrCreateUser(email, str(fd, "name") || null);
    const added = await svc.addMember(group.id, invitee.id, user.id);
    if (invitee.id !== user.id) await sendInvite(user, invitee, group);
    revalidatePath(`/groups/${group.id}`);
    return {
      message: added ? `Added ${svc.displayName(invitee)} and emailed them a magic link.` : `${svc.displayName(invitee)} is already in the group — we re-sent their link.`,
      devMailbox: devMailboxEnabled(),
    };
  } catch (e) {
    return fail(e);
  }
}

export async function joinGroupAction(fd: FormData) {
  const user = await requireUser();
  const group = await svc.getGroupByInvite(str(fd, "token"));
  if (!group) redirect("/");
  await svc.addMember(group.id, user.id, user.id);
  redirect(`/groups/${group.id}`);
}

export async function addFriendAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const email = str(fd, "email");
    if (!svc.isEmail(email)) return { error: "Enter a valid email address" };
    const friend = await svc.findOrCreateUser(email, str(fd, "name") || null);
    if (friend.id === user.id) return { error: "That's you!" };
    const already = await svc.areFriends(user.id, friend.id);
    await svc.makeFriends(user.id, friend.id);
    if (!already) await svc.logActivity("friend_added", user.id, `added ${svc.displayName(friend)} as a friend`, [friend.id]);
    await sendInvite(user, friend, null);
    revalidatePath("/friends");
    return { message: `Invited ${svc.displayName(friend)} by email.`, devMailbox: devMailboxEnabled() };
  } catch (e) {
    return fail(e);
  }
}

// ───────── groups ─────────
export async function updateGroupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await svc.updateGroup(num(fd, "groupId"), user.id, {
      name: str(fd, "name"),
      type: str(fd, "type"),
      currency: str(fd, "currency"),
      simplify: fd.get("simplify") === "on",
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/groups/${num(fd, "groupId")}`);
  return { message: "Group saved" };
}

export async function toggleSimplifyAction(fd: FormData) {
  const user = await requireUser();
  const groupId = num(fd, "groupId");
  await svc.updateGroup(groupId, user.id, { simplify: str(fd, "simplify") === "1" });
  revalidatePath(`/groups/${groupId}`);
}

export async function regenerateInviteAction(fd: FormData) {
  const user = await requireUser();
  const groupId = num(fd, "groupId");
  await svc.regenerateInvite(groupId, user.id);
  revalidatePath(`/groups/${groupId}`);
}

// ───────── expenses ─────────
export interface ExpensePayload {
  id?: number;
  groupId: number | null;
  description: string;
  amount: string;
  currency: string;
  date: string;
  categoryId: number | null;
  notes: string;
  splitType: SplitType;
  participants: { userId: number; value: number }[];
  payers: { userId: number; paid: number }[];
  seed: number;
}

export async function saveExpenseAction(p: ExpensePayload): Promise<FormState> {
  const user = await requireUser();
  const amount = parseAmount(p.amount);
  if (amount === null || amount <= 0) return { error: "Enter a valid amount (up to 2 decimals)" };
  let id: number;
  const input: svc.ExpenseInput = { ...p, amount };
  try {
    if (p.id) {
      await svc.updateExpense(user.id, p.id, input);
      id = p.id;
    } else {
      id = await svc.createExpense(user.id, input);
    }
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/expenses/${id}`);
}

export async function deleteExpenseAction(fd: FormData) {
  const user = await requireUser();
  const e = await svc.setExpenseDeleted(user.id, num(fd, "id"), str(fd, "restore") !== "1");
  revalidatePath("/", "layout");
  if (str(fd, "restore") === "1") redirect(`/expenses/${e.id}`);
  redirect(e.group_id ? `/groups/${e.group_id}` : "/");
}

export async function recordPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const amount = parseAmount(str(fd, "amount"));
  if (amount === null || amount <= 0) return { error: "Enter a valid amount" };
  try {
    const gid = str(fd, "groupId");
    await svc.recordPayment(user.id, {
      groupId: gid ? Number(gid) : null,
      from: num(fd, "from"),
      to: num(fd, "to"),
      amount,
      currency: str(fd, "currency"),
      date: str(fd, "date") || undefined,
      note: str(fd, "note") || undefined,
    });
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  return { message: "Payment recorded ✓" };
}

export async function settleFriendAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    const n = await svc.settleWithFriend(user.id, num(fd, "friendId"), str(fd, "currency"));
    revalidatePath("/", "layout");
    return { message: n ? `Recorded ${n} payment${n === 1 ? "" : "s"} ✓` : "Nothing to settle" };
  } catch (e) {
    return fail(e);
  }
}

// ───────── dev ─────────
export async function clearMailboxAction() {
  if (!devMailboxEnabled()) return;
  await svc.clearMail();
  revalidatePath("/dev/mailbox");
}

