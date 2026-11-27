"use client";

import { useSyncExternalStore } from "react";
import { Share2 } from "lucide-react";

const noop = () => () => {};

/** Native share sheet (phones). Renders nothing where the Web Share API is missing. */
export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const canShare = useSyncExternalStore(noop, () => typeof navigator !== "undefined" && "share" in navigator, () => false);
  if (!canShare) return null;
  return (
    <button type="button" className="btn w-full" onClick={() => navigator.share({ url, title, text }).catch(() => {})}>
      <Share2 size={18} /> Share invite link
    </button>
  );
}
