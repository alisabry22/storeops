"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetchAll } from "@/lib/asc/client";
import { PaywallModal } from "@/components/Paywall";
import { useIsPro, useLicense } from "@/lib/license";
import type { App } from "@/lib/asc/types";

function AppAvatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700/60 bg-gradient-to-br from-zinc-800 to-zinc-900 font-semibold text-sm text-emerald-400">
      {initials}
    </div>
  );
}

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
      <div className="flex items-center justify-between mb-10">
        <h1 className="text-2xl font-bold tracking-tight">
          Store<span className="text-emerald-400">Ops</span>
          <span className="ml-3 text-zinc-500 font-normal text-lg">
            Your apps
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {isPro ? (
            <span
              className="text-xs rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-emerald-400 cursor-default"
              title={`${productName ?? "StoreOps Pro"} — double-click to remove license from this device`}
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
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {!apps && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="card p-5 animate-pulse flex items-center gap-4"
            >
              <div className="h-11 w-11 rounded-xl bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-zinc-800" />
                <div className="h-3 w-56 rounded bg-zinc-800/60" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {apps?.map((app, i) => (
          <Link
            key={app.id}
            href={`/apps/${app.id}`}
            className="card animate-fade-up flex items-center gap-4 p-5 hover:border-emerald-700/60 hover:bg-zinc-900/80 transition group"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <AppAvatar name={app.attributes.name} />
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold group-hover:text-emerald-400 transition truncate">
                {app.attributes.name}
              </h2>
              <p className="text-sm text-zinc-500 font-mono mt-0.5 truncate">
                {app.attributes.bundleId}
              </p>
            </div>
            <span className="text-xs text-zinc-600 font-mono hidden sm:block">
              {app.attributes.primaryLocale}
            </span>
            <span className="text-zinc-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition">
              →
            </span>
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
