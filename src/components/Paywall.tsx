"use client";

import { useState } from "react";
import { CHECKOUT_URL, useLicense } from "@/lib/license";

/**
 * Upgrade modal: buy on Lemon Squeezy → paste license key → unlocked.
 * No account, no server-side user state.
 */
export function PaywallModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { activate } = useLicense();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setError("");
    const res = await activate(key);
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setTimeout(onClose, 1200);
    } else {
      setError(res.error ?? "Activation failed.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-semibold text-emerald-400">
              StoreOps Pro activated
            </p>
            <p className="text-sm text-zinc-400 mt-1">
              Every apply is now unlocked. Go save some time.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold mb-1">
              Unlock applies with{" "}
              <span className="text-emerald-400">StoreOps Pro</span>
            </h2>
            <p className="text-sm text-zinc-400 mb-4">
              Free covers browsing, previews, and CSV exports. Writing to
              Apple — bulk metadata, pricing, subscriptions, one-click
              rollback — is Pro.
            </p>

            <ul className="text-sm text-zinc-300 space-y-1.5 mb-5">
              <li>✓ Bulk apply metadata across every locale</li>
              <li>✓ Reprice 175 storefronts in one click</li>
              <li>✓ Subscription pricing with subscriber protection</li>
              <li>✓ Pre-apply snapshots + one-click rollback</li>
              <li>✓ One botched manual update costs more than this</li>
            </ul>

            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition mb-4"
            >
              Get Pro → instant license key
            </a>

            <div className="border-t border-zinc-800 pt-4">
              <label className="block text-xs text-zinc-400 mb-1.5">
                Already have a key?
              </label>
              <div className="flex gap-2">
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
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
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
