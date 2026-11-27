"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

const noop = () => () => {};

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testId?: string;
};

/**
 * Mobile bottom sheet (centred dialog on md+). Drag the handle down, tap the
 * backdrop, or press Escape to close. Locks page scroll while open.
 */
export function BottomSheet({ open, onClose, title, children, testId }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 50);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => { start.current = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { if (start.current !== null) setDrag(Math.max(0, e.clientY - start.current)); };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > 90) onClose();
    setDrag(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" data-testid={testId}>
      <div className="animate-fade-in absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl md:max-w-xl md:animate-fade-in md:rounded-3xl"
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : undefined}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 md:hidden"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          data-testid="sheet-handle"
        >
          <span className="h-1.5 w-11 rounded-full bg-slate-300" />
        </div>
        <div className="flex shrink-0 items-center gap-2 px-5 pb-2 pt-1 md:pt-5">
          <h2 id={titleId} className="flex-1 text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-slate-500 active:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens a sheet holding `children` (server-rendered forms are fine). */
export function SheetButton({
  label,
  title,
  children,
  className = "btn",
  testId,
  icon,
  closeOnSuccess = false,
}: {
  label: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  icon?: React.ReactNode;
  /** Close once an ActionForm inside reports success (e.g. a recorded payment). */
  closeOnSuccess?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = body.current;
    if (!open || !closeOnSuccess || !el) return;
    const onOk = () => setTimeout(close, 700);
    el.addEventListener("actionform:success", onOk);
    return () => el.removeEventListener("actionform:success", onOk);
  }, [open, closeOnSuccess, close]);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} data-testid={testId ? `${testId}-open` : undefined}>
        {icon}{label}
      </button>
      <BottomSheet open={open} onClose={close} title={title} testId={testId}>
        <div ref={body}>{children}</div>
      </BottomSheet>
    </>
  );
}

/** Sheet shown for an intercepted route; closing navigates back. */
export function RouteSheet({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  const router = useRouter();
  const close = useCallback(() => router.back(), [router]);
  return (
    <BottomSheet open onClose={close} title={title} testId={testId}>
      {children}
    </BottomSheet>
  );
}
