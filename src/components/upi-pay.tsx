"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IndianRupee, QrCode, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { recordPaymentAction, upiFriendPaidAction } from "@/app/actions";
import { centsToInput, formatMoney } from "@/lib/money";
import { ActionForm } from "./action-form";
import { BottomSheet } from "./bottom-sheet";

export const UPI_CAVEAT = "UPI apps may limit link payments to personal IDs; if your app blocks it, scan the QR or pay manually.";

type Props = {
  uri: string;
  payee: string;
  vpa: string;
  amountCents: number;
  /** "group": records one payment (hidden fields: groupId, from, to). "friend": settles with a friend (friendId). */
  kind: "group" | "friend";
  hidden: Record<string, string | number>;
  className?: string;
};

/** "Pay ₹Y via UPI": app picker on phones, QR on wide screens, then an "I've paid" confirm. */
export function UpiPayButton({ uri, payee, vpa, amountCents, kind, hidden, className = "btn btn-sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setTapped(false); }, []);

  useEffect(() => {
    if (!open || qr) return;
    QRCode.toDataURL(uri, { margin: 1, width: 240, color: { dark: "#134e4a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [open, qr, uri]);

  useEffect(() => {
    const el = body.current;
    if (!open || !el) return;
    const onOk = () => setTimeout(close, 900);
    el.addEventListener("actionform:success", onOk);
    return () => el.removeEventListener("actionform:success", onOk);
  }, [open, close]);

  const amount = formatMoney(amountCents, "INR");
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-testid="upi-pay-open">
        <IndianRupee size={15} /> Pay {amount} via UPI
      </button>
      <BottomSheet open={open} onClose={close} title={`Pay ${payee}`} testId="sheet-upi">
        <div ref={body} className="space-y-4">
          <div className="rounded-2xl bg-brand-50 p-4 text-center">
            <p className="money text-3xl font-extrabold text-brand-900">{amount}</p>
            <p className="mt-1 text-sm text-brand-700">to {payee} · <span className="font-mono text-xs">{vpa}</span></p>
          </div>

          {/* Phones: hand off to the UPI app picker (GPay, PhonePe, Paytm, BHIM…). */}
          <a href={uri} onClick={() => setTapped(true)} className="btn w-full text-base md:hidden" data-testid="upi-open-app">
            <Smartphone size={18} /> Open UPI app
          </a>

          {/* Wide screens: scan with a phone. */}
          <div className="hidden flex-col items-center gap-2 md:flex" data-testid="upi-qr">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`UPI QR code to pay ${amount} to ${payee}`} width={220} height={220} className="rounded-xl ring-1 ring-slate-200" />
            ) : (
              <div className="grid h-[220px] w-[220px] place-items-center rounded-xl bg-slate-50 text-slate-400"><QrCode /></div>
            )}
            <p className="text-sm font-medium text-slate-700">Scan with any UPI app</p>
          </div>

          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="upi-caveat">{UPI_CAVEAT}</p>

          {tapped ? null : (
            <button type="button" className="w-full text-center text-sm font-medium text-brand-700 md:hidden" onClick={() => setTapped(true)}>
              Already paid? Record it
            </button>
          )}

          <div className={`${tapped ? "" : "hidden"} border-t border-slate-100 pt-4 md:block`} data-testid="upi-paid-form">
            <p className="mb-2 text-sm font-semibold text-slate-800">Done paying? Confirm it here</p>
            <ActionForm action={kind === "group" ? recordPaymentAction : upiFriendPaidAction} submitLabel="I've paid" submitClassName="btn w-full" className="space-y-3">
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="currency" value="INR" />
              <input type="hidden" name="method" value="upi" />
              <div>
                <label className="label" htmlFor={`upi-amt-${hidden.to ?? hidden.friendId}`}>Amount paid (INR)</label>
                <input
                  id={`upi-amt-${hidden.to ?? hidden.friendId}`}
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  defaultValue={centsToInput(amountCents)}
                  className="input money text-center text-xl font-bold"
                />
              </div>
              <p className="text-center text-xs text-slate-500">We&apos;ll record it and email {payee} that you paid.</p>
            </ActionForm>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
