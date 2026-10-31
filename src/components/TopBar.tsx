"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { useIsPro, useLicense } from "@/lib/license";
import { useState } from "react";
import { AccountControls } from "./AccountControls";
import { PaywallModal } from "./Paywall";
import { isCommunityEdition } from "@/lib/edition";

const clerkEnabled =
  !isCommunityEdition && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

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
  const { productName } = useLicense();
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
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
        <Link href="/apps" className="text-2xl font-bold tracking-tight truncate" aria-label="StoreOps apps">
          Store<span className="text-emerald-400">Ops</span>
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/play"
          className="inline-flex min-h-11 items-center text-sm text-zinc-300 hover:text-emerald-300 transition-colors"
        >
          Google Play →
        </Link>
        {clerkEnabled && (
          <Link
            href="/account"
            className="hidden sm:inline text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            Account
          </Link>
        )}
        {isCommunityEdition ? (
          <a
            href="https://github.com/alisabry22/storeops"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs rounded-full border border-sky-800 bg-sky-950/40 px-3 py-1 text-sky-300"
            title="Self-hosted Community Edition — no StoreOps account required"
          >
            Community · self-hosted
          </a>
        ) : isPro ? (
          <span
            className="text-xs rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-emerald-400 cursor-default"
            title={productName ?? "StoreOps Pro"}
          >
            Cloud · Pro
          </span>
        ) : (
          <button
            onClick={() => setPaywallOpen(true)}
            className="text-xs rounded-full border border-zinc-700 px-3 py-1 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 transition"
          >
            Cloud · Upgrade to Pro
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
        <AccountControls />
      </div>
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </header>
  );
}
