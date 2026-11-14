"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetchAll } from "@/lib/asc/client";
import { TopBar } from "@/components/TopBar";
import { AppTabs } from "@/components/AppTabs";
import { AppIcon } from "@/components/AppIcon";
import { useLicense } from "@/lib/license";
import type { App } from "@/lib/asc/types";
import { useHydrated } from "@/lib/use-hydrated";
import { useSigningKey } from "@/lib/use-signing-key";
import { PageSkeleton } from "@/components/PageSkeleton";

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
  const { credentials } = useCredentials();
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState("");
  const hydrated = useHydrated();
  const { revalidate } = useLicense();
  const ascKey = useSigningKey(
    "asc-signing-key",
    hydrated && !!credentials && !credentials.privateKeyPem,
    credentials,
  );
  const keyReady = !!credentials && (!!credentials.privateKeyPem || ascKey === "present");

  // Re-check the license against Lemon Squeezy at most once a day
  useEffect(() => {
    if (hydrated) revalidate();
  }, [hydrated, revalidate]);

  useEffect(() => {
    if (!hydrated) return;
    // No IDs, or IDs without a key on this device → one-screen (re)connect.
    if (!credentials || ascKey === "missing") {
      router.replace("/connect");
      return;
    }
    if (!keyReady) return;
    ascFetchAll<App>(credentials, "/v1/apps")
      .then(setApps)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hydrated, credentials, ascKey, keyReady, router]);

  if (!hydrated || !credentials || !keyReady) return <PageSkeleton />;

  return (
    <main id="main-content" className="max-w-5xl mx-auto w-full px-6 py-8 sm:py-10">
      <TopBar />

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Your apps</h1>
          <p className="mt-2 text-base text-zinc-400">Pick what you want to change. Every change starts as a free preview.</p>
        </div>
        {apps && apps.length > 0 && (
          <span className="text-sm text-zinc-500">{apps.length} {apps.length === 1 ? "app" : "apps"} on this key</span>
        )}
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

      <div className="space-y-4">
        {apps?.map((app) => (
          <article
            key={app.id}
            className="card p-4 transition-colors hover:border-zinc-600 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-4">
            <AppAvatar name={app.attributes.name} />
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold truncate">
                <Link href={`/apps/${app.id}`}>{app.attributes.name}</Link>
              </h2>
              <p className="text-sm text-zinc-500 font-mono mt-0.5 truncate">
                {app.attributes.bundleId}
              </p>
            </div>
            <span className="text-xs text-zinc-600 font-mono hidden sm:block">
              {app.attributes.primaryLocale}
            </span>
            </div>
            <div className="[&>nav]:mb-0"><AppTabs appId={app.id} /></div>
          </article>
        ))}
        {apps?.length === 0 && (
          <div className="card p-8 text-center animate-fade-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/70 bg-emerald-950/40 text-2xl">
              <AppIcon name="product" className="size-6 text-emerald-300" />
            </div>
            <h3 className="font-semibold mb-1">No apps on this key</h3>
            <p className="text-sm text-zinc-400 mb-4 max-w-sm mx-auto">
              The App Store Connect key you connected has no apps visible. This
              usually means the key&apos;s role isn&apos;t granted access to any app, or
              you haven&apos;t created an app record yet.
            </p>
            <a
              href="https://appstoreconnect.apple.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-emerald-600 hover:text-emerald-400 transition"
            >
              Open App Store Connect →
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
