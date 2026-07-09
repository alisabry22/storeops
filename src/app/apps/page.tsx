"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetchAll } from "@/lib/asc/client";
import { PaywallModal } from "@/components/Paywall";
import { useIsPro, useLicense } from "@/lib/license";
import type { App } from "@/lib/asc/types";

export default function AppsPage() {
  const router = useRouter();
  const { credentials, clearCredentials } = useCredentials();
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const isPro = useIsPro();
  const { revalidate, deactivate, productName } = useLicense();
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => setHydrated(true), []);

  // Re-check the license against Lemon Squeezy at most once a day
  useEffect(() => {
    if (hydrated) revalidate();
  }, [hydrated, revalidate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!credentials) {
      router.replace("/");
      return;
    }
    ascFetchAll<App>(credentials, "/v1/apps")
      .then(setApps)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hydrated, credentials, router]);

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-3xl mx-auto w-full px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          Store<span className="text-emerald-400">Ops</span>
          <span className="ml-3 text-zinc-500 font-normal text-lg">
            Your apps
          </span>
        </h1>
        <div className="flex items-center gap-4">
          {isPro ? (
            <span
              className="text-xs rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-emerald-400 cursor-default"
              title={`${productName ?? "StoreOps Pro"} — click Disconnect license to remove`}
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
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {!apps && !error && (
        <p className="text-zinc-400 animate-pulse">Loading your apps…</p>
      )}

      <div className="space-y-3">
        {apps?.map((app) => (
          <Link
            key={app.id}
            href={`/apps/${app.id}`}
            className="block rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 hover:border-emerald-600/60 transition group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold group-hover:text-emerald-400 transition">
                  {app.attributes.name}
                </h2>
                <p className="text-sm text-zinc-500 font-mono mt-0.5">
                  {app.attributes.bundleId}
                </p>
              </div>
              <span className="text-xs text-zinc-500">
                {app.attributes.primaryLocale}
              </span>
            </div>
          </Link>
        ))}
        {apps?.length === 0 && (
          <p className="text-zinc-400">No apps found on this account.</p>
        )}
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </main>
  );
}
