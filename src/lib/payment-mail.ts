// "X paid you ₹Y" emails. Sending is best-effort: it never throws, so a mail outage can't
// fail or roll back a recorded payment.
import { all } from "./db";
import { linkEmail, sendMail, type MailMessage } from "./mail";
import { formatMoney } from "./money";
import { displayName } from "./services";
import { formatDateIST } from "./time";

interface PaymentRow {
  id: number;
  amount_cents: number;
  currency: string;
  date: string;
  notes: string | null;
  group_id: number | null;
  group_name: string | null;
  payment_method: string | null;
  payer_id: number;
  payer_name: string | null;
  payer_email: string;
  to_id: number;
  to_name: string | null;
  to_email: string;
}

async function loadPayments(ids: number[]): Promise<PaymentRow[]> {
  if (!ids.length) return [];
  return await all<PaymentRow>(
    `SELECT e.id, e.amount_cents, e.currency, e.date, e.notes, e.group_id, g.name AS group_name, e.payment_method,
            p.id AS payer_id, p.name AS payer_name, p.email AS payer_email,
            r.id AS to_id, r.name AS to_name, r.email AS to_email
       FROM expenses e
       LEFT JOIN groups g ON g.id = e.group_id
       JOIN expense_shares sp ON sp.expense_id = e.id AND sp.paid_cents > 0
       JOIN users p ON p.id = sp.user_id
       JOIN expense_shares sr ON sr.expense_id = e.id AND sr.owed_cents > 0
       JOIN users r ON r.id = sr.user_id
      WHERE e.is_payment = 1 AND e.id IN (${ids.map(() => "?").join(",")})
      ORDER BY e.id`,
    ...ids,
  );
}

const fmtDay = (d: string) => formatDateIST(d.slice(0, 10));

/** Build one email per (payer → recipient, currency) covering the given payment rows. */
export function paymentEmails(rows: PaymentRow[], appBase: string): MailMessage[] {
  const byKey = new Map<string, PaymentRow[]>();
  for (const r of rows) {
    const k = `${r.payer_id}>${r.to_id}:${r.currency}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const out: MailMessage[] = [];
  for (const list of byKey.values()) {
    const first = list[0]!;
    const total = list.reduce((a, r) => a + r.amount_cents, 0);
    const payer = displayName({ name: first.payer_name, email: first.payer_email });
    const amount = formatMoney(total, first.currency);
    const where = list.map((r) => r.group_name).filter(Boolean) as string[];
    const context = where.length ? `in ${[...new Set(where)].join(", ")}` : "between you two";
    const viaUpi = list.some((r) => r.payment_method === "upi");
    const notes = [...new Set(list.map((r) => r.notes).filter(Boolean))] as string[];
    const url = first.group_id && list.every((r) => r.group_id === first.group_id) ? `${appBase}/groups/${first.group_id}` : `${appBase}/friends/${first.payer_id}`;
    const body = [
      `${payer} recorded a payment of ${amount} to you ${context}${viaUpi ? " (paid via UPI)" : ""} on ${fmtDay(first.date)}.`,
      notes.length ? `Note: ${notes.join(" · ")}` : "",
      viaUpi ? "Please check your UPI app or bank statement to confirm the money arrived." : "",
    ]
      .filter(Boolean)
      .join(" ");
    const mail = linkEmail({
      heading: `${payer} paid you ${amount}`,
      body,
      cta: "View in Splitly",
      url,
      footer: "You're getting this because a payment to you was recorded on Splitly.",
    });
    out.push({ to: first.to_email, subject: `${payer} paid you ${amount}`, ...mail });
  }
  return out;
}

/**
 * Email the recipients of the given payments. Skips the person who recorded them
 * (they already know). Never throws; returns how many emails went out.
 */
export async function notifyPayments(
  paymentIds: number[],
  opts: { actorId: number; appBase: string; send?: (m: MailMessage) => Promise<void> },
): Promise<number> {
  const send = opts.send ?? sendMail;
  let sent = 0;
  try {
    const rows = (await loadPayments(paymentIds)).filter((r) => r.to_id !== opts.actorId);
    for (const m of paymentEmails(rows, opts.appBase)) {
      try {
        await send(m);
        sent++;
      } catch (e) {
        console.error(`[splitly] payment email to ${m.to} failed:`, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[splitly] couldn't prepare payment emails:", e instanceof Error ? e.message : e);
  }
  return sent;
}
