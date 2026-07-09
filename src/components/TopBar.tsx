"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { useIsPro, useLicense } from "@/lib/license";
import { useState } from "react";
import { PaywallModal } from "./Paywall";

/**
 * Shared top chrome for every authenticated page: logo, Pro badge, Disconnect.
 * On app-scoped pages a "← Apps" back link is shown to the left of the logo.
 *
 * One component instead of five near-duplicates scattered across pages.
 */
export function TopBar({ backToApps = false }: { backToApps?: boolean }) {
  const router = useRouter();
  const { clearCredentials } = useCredentials();
  const isPro = useIsPro();
  const { deactivate, productName } = useLicense();
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <header className="flex items-center justify-between mb-10">
      <div className="flex items-center gap-3 min-w-0">
        {backToApps && (
          <Link
            href="/apps"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition shrink-0"
            aria-label="Back to apps"
          >
            ← Apps
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight truncate">
          Store<span className="text-emerald-400">Ops</span>
        </h1>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {isPro ? (
          <span
            className="text-xs rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-emerald-400 cursor-default"
            title={`${productName ?? "StoreOps Pro"} — double-click to release this device's license`}
            onDoubleClick={deactivate}
          >
            ★ Pro
          </span>
        ) : (
          <button
            onClick={() => setPaywallOpen(true)}
            className="text-xs rounded-full border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 transition"
          >
            Upgrade to Pro
          </button>
        )}
        <button
          onClick={() => {
            clearCredentials();
            router.replace("/");
          }}
          className="text-sm text-zinc-500 hover:text-zinc-200 transition"
        >
          Disconnect
        </button>
      </div>
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </header>
  );
}