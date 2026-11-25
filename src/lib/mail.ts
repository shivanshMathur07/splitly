import nodemailer, { type Transporter } from "nodemailer";
import { run } from "./db";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

const isProduction = () => process.env.NODE_ENV === "production";

/** Thrown when a production server has no SMTP settings, so emails can't go anywhere. */
export class MailNotConfiguredError extends Error {
  constructor() {
    super(
      "[splitly] SMTP is not configured. In production, emails (sign-in links, invites) need SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM. Set them in your host's environment variables (Vercel: Project → Settings → Environment Variables) and redeploy.",
    );
    this.name = "MailNotConfiguredError";
  }
}

/**
 * The dev mailbox (/dev/mailbox) is never available in production: anyone could read other
 * people's sign-in links there. Outside production it's on whenever SMTP isn't configured,
 * or when DEV_MAILBOX=true; DEV_MAILBOX=false turns it off.
 */
export function devMailboxEnabled(): boolean {
  if (isProduction()) return false;
  if (process.env.DEV_MAILBOX === "false") return false;
  return !smtpConfigured() || process.env.DEV_MAILBOX === "true";
}

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? /^\s*true\b/i.test(process.env.SMTP_SECURE) : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  if (isProduction() && !smtpConfigured()) throw new MailNotConfiguredError();
  if (devMailboxEnabled()) {
    await run("INSERT INTO dev_mailbox (to_email, subject, text_body, html_body) VALUES (?, ?, ?, ?)", msg.to, msg.subject, msg.text, msg.html ?? null);
  }
  if (smtpConfigured()) {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || "Splitly <no-reply@localhost>",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return;
  }
  const line = "─".repeat(60);
  console.log(`\n${line}\n📧  [dev mail] To: ${msg.to}\n    Subject: ${msg.subject}\n\n${msg.text}\n    (also visible at /dev/mailbox)\n${line}\n`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function linkEmail(opts: { heading: string; body: string; cta: string; url: string; footer?: string }): { text: string; html: string } {
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.cta}: ${opts.url}\n\n${opts.footer ?? "This link expires in 30 minutes and can be used once."}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
<h2 style="color:#0f766e;margin:0 0 12px">${esc(opts.heading)}</h2>
<p style="color:#334155;line-height:1.5">${esc(opts.body)}</p>
<p><a href="${esc(opts.url)}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(opts.cta)}</a></p>
<p style="color:#94a3b8;font-size:12px">${esc(opts.footer ?? "This link expires in 30 minutes and can be used once.")}<br>${esc(opts.url)}</p></div>`;
  return { text, html };
}
