"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHECKOUT_URL,
  LIFETIME_CHECKOUT_URL,
  LIFETIME_PRICE,
  YEARLY_PRICE,
  useLicense,
} from "@/lib/license";

/** The change the user just tried to apply — their own numbers, not copy. */
export interface PendingValue {
  /** How many individual writes this apply performs */
  count: number;
  /** What a unit is: "price changes", "locale updates", … */
  unit: string;
  /** Honest estimate of doing the same by hand in App Store Connect */
  manualMinutes: number;
}

/** Conservative per-unit manual-work estimates for each apply kind. */
export function estimateManualMinutes(
  kind: "price" | "subscription" | "metadata",
  count: number
): number {
  const perUnit = { price: 0.5, subscription: 1, metadata: 2 }[kind];
  return Math.max(5, Math.round(count * perUnit));
}

/**
 * Upgrade modal: buy on Lemon Squeezy → paste license key → unlocked.
 * No account, no server-side user state.
 */
export function PaywallModal({
  open,
  onClose,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  pending?: PendingValue;
}) {
  const { activate } = useLicense();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Esc closes; focus the input on open so keyboard users can paste immediately
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !done) onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, done, onClose]);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError("");
    const res = await activate(key);
    setBusy(false);
    if (res.ok) {
      // Also attach the key to the account when signed in, so Pro follows
      // the user across devices. Best-effort — device license already works.
      void fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key.trim() }),
      }).catch(() => {});
      setDone(true);
      setTimeout(onClose, 1600);
    } else {
      setError(res.error ?? "Activation failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-backdrop-in"
      onClick={() => !done && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to StoreOps Pro"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-8">
            <svg
              width="64"
              height="64"
              viewBox="0 0 48 48"
              className="mx-auto mb-3"
              aria-hidden
            >
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="none"
                stroke="rgba(16,185,129,0.25)"
                strokeWidth="2"
                className="animate-check-circle"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                fill="rgba(16,185,129,0.12)"
                className="animate-check-circle"
              />
              <path
                d="M14 24 L21 31 L34 18"
                fill="none"
                stroke="rgb(16,185,129)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-check-stroke"
              />
            </svg>
            <p className="font-semibold text-emerald-400 text-lg">
              StoreOps Pro activated
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              Every apply is now unlocked. Go save some time.
            </p>
          </div>
        ) : (
          <>
            {pending ? (
              <>
                <h2 className="text-lg font-bold mb-1">
                  <span className="text-emerald-400">{pending.count} {pending.unit}</span>,
                  one click away
                </h2>
                <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm">
                  <div className="flex justify-between text-zinc-400">
                    <span>By hand in App Store Connect</span>
                    <span className="font-mono text-zinc-300">
                      ~{pending.manualMinutes} min
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400 mt-1">
                    <span>With StoreOps Pro</span>
                    <span className="font-mono text-emerald-400">1 click</span>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 mb-4">
                  Your preview is ready and nothing has been sent to Apple.
                  Pro unlocks the apply — this one and every one after it,
                  with a snapshot saved first so you can always roll back.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-1">
                  Unlock applies with{" "}
                  <span className="text-emerald-400">StoreOps Pro</span>
                </h2>
                <p className="text-sm text-zinc-400 mb-4">
                  Free covers browsing, previews, and CSV exports. Writing to
                  the stores — bulk metadata, pricing, subscriptions, one-click
                  rollback — is Pro.
                </p>
                <ul className="text-sm text-zinc-300 space-y-1.5 mb-5">
                  <li>✓ App Store + Google Play — both stores included</li>
                  <li>✓ Bulk apply metadata across every locale</li>
                  <li>✓ Reprice every storefront in one click</li>
                  <li>✓ Subscription pricing — existing subscribers stay protected</li>
                  <li>✓ Pre-apply snapshots + one-click rollback</li>
                </ul>
              </>
            )}

            {LIFETIME_CHECKOUT_URL ? (
              <div className="space-y-2 mb-1.5">
                <a
                  href={LIFETIME_CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-glow block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
                >
                  Lifetime — {LIFETIME_PRICE} once, own it forever
                </a>
                <a
                  href={CHECKOUT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center rounded-md border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:border-emerald-500 transition"
                >
                  Yearly — {YEARLY_PRICE}/yr
                </a>
              </div>
            ) : (
              <a
                href={CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glow block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition mb-1.5"
              >
                Get Pro {YEARLY_PRICE}/yr → instant license key
              </a>
            )}
            <p className="text-center text-xs text-zinc-500 mb-4">
              14-day refund · one botched manual price update costs more than this.
            </p>

            <div className="border-t border-zinc-800 pt-4">
              <label className="block text-xs text-zinc-400 mb-1.5">
                Already have a key?
              </label>
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && key.trim() && submit()}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="flex-1 rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={submit}
                  disabled={busy || !key.trim()}
                  className="rounded-md border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-400 hover:border-emerald-500 disabled:opacity-40 transition"
                >
                  {busy ? "Checking…" : "Activate"}
                </button>
              </div>
              {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>

            <button
              onClick={onClose}
              className="mt-4 w-full text-center text-xs text-zinc-500 hover:text-zinc-300"
            >
              Not now · press Esc
            </button>
          </>
        )}
      </div>
    </div>
  );
}
