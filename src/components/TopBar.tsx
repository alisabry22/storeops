"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { useIsPro, useLicense } from "@/lib/license";
import { useSigningKey } from "@/lib/use-signing-key";
import { AccountControls } from "./AccountControls";
import { PaywallModal } from "./Paywall";
import { isCommunityEdition } from "@/lib/edition";

const clerkEnabled =
  !isCommunityEdition && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

type Store = "apple" | "google";

/**
 * Shared top chrome for every working page, both stores: logo, store switcher,
 * plan badge, account, disconnect. One header so moving between App Store and
 * Google Play never changes where things are.
 */
export function TopBar({
  backToApps = false,
  store = "apple",
  onDisconnect,
  disconnectDisabled = false,
  showDisconnect = true,
}: {
  backToApps?: boolean;
  store?: Store;
  /** Google Play passes its own disconnect; Apple defaults to clearing ASC keys. */
  onDisconnect?: () => void;
  disconnectDisabled?: boolean;
  showDisconnect?: boolean;
}) {
  const router = useRouter();
  const { credentials, clearCredentials } = useCredentials();
  const isPro = useIsPro();
  const { productName } = useLicense();
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Apple pages: saved IDs without a key on this device can't sign anything.
  // Send the user straight to the one-file reconnect instead of a wall of errors.
  const appleKey = useSigningKey(
    "asc-signing-key",
    store === "apple" && !!credentials && !credentials.privateKeyPem,
    credentials,
  );
  useEffect(() => {
    if (store === "apple" && credentials && !credentials.privateKeyPem && appleKey === "missing") {
      router.replace("/connect");
    }
  }, [store, credentials, appleKey, router]);

  const tabClass = (active: boolean) =>
    `inline-flex min-h-9 items-center rounded-md px-3 text-sm font-medium transition-colors ${
      active ? "bg-zinc-800 text-zinc-50 shadow-sm" : "text-zinc-400 hover:text-zinc-100"
    }`;

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-zinc-900 pb-5">
      <div className="flex min-w-0 items-center gap-4">
        <Link href={store === "google" ? "/play" : "/apps"} className="shrink-0 text-xl font-bold tracking-tight" aria-label="StoreOps home">
          Store<span className="text-emerald-400">Ops</span>
        </Link>
        <nav aria-label="Store" className="flex rounded-lg border border-zinc-800 bg-zinc-950/80 p-1">
          <Link href="/apps" aria-current={store === "apple" ? "page" : undefined} className={tabClass(store === "apple")}>
            App Store
          </Link>
          <Link href="/play" aria-current={store === "google" ? "page" : undefined} className={tabClass(store === "google")}>
            Google Play
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {isCommunityEdition ? (
          <a
            href="https://github.com/alisabry22/storeops"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-sky-800 bg-sky-950/40 px-3 py-1 text-xs text-sky-300"
            title="Self-hosted Community Edition — no StoreOps account required"
          >
            Community · self-hosted
          </a>
        ) : isPro ? (
          <span
            className="cursor-default rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-400"
            title={productName ?? "StoreOps Pro"}
          >
            Pro
          </span>
        ) : (
          <button
            onClick={() => setPaywallOpen(true)}
            className="rounded-full border border-emerald-800/80 px-3 py-1 text-xs font-medium text-emerald-300 transition hover:border-emerald-500 hover:text-emerald-200"
          >
            Upgrade to Pro
          </button>
        )}
        {clerkEnabled && (
          <Link href="/account" className="hidden text-sm text-zinc-400 transition hover:text-zinc-100 sm:inline">
            Account
          </Link>
        )}
        {showDisconnect && (
          <button
            disabled={disconnectDisabled}
            onClick={() => {
              if (onDisconnect) {
                onDisconnect();
                return;
              }
              clearCredentials();
              router.replace("/");
            }}
            className="text-sm text-zinc-500 transition hover:text-zinc-200 disabled:opacity-40"
            title={store === "google" ? "Remove the Google key from this browser" : "Remove the Apple key from this browser"}
          >
            Disconnect
          </button>
        )}
        <AccountControls />
      </div>
      {backToApps && (
        <Link href="/apps" className="-mt-1 inline-flex min-h-8 basis-full items-center text-sm text-zinc-400 transition hover:text-zinc-100">
          ← All apps
        </Link>
      )}
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </header>
  );
}
