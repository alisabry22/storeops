"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetchAll } from "@/lib/asc/client";
import { TopBar } from "@/components/TopBar";
import { useLicense } from "@/lib/license";
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
  const { credentials } = useCredentials();
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const { revalidate } = useLicense();

  useEffect(() => setHydrated(true), []);

  // Re-check the license against Lemon Squeezy at most once a day
  useEffect(() => {
    if (hydrated) revalidate();
  }, [hydrated, revalidate]);

  useEffect(() => {
    if (!hydrated) return;
    if (!credentials) {
      router.replace("/connect");
      return;
    }
    ascFetchAll<App>(credentials, "/v1/apps")
      .then(setApps)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hydrated, credentials, router]);

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-3xl mx-auto w-full px-6 py-12">
      <TopBar />

      <h2 className="text-lg font-semibold text-zinc-400 mb-6">
        Your apps
      </h2>

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
          <div className="card p-8 text-center animate-fade-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-900/70 bg-emerald-950/40 text-2xl">
              📦
            </div>
            <h3 className="font-semibold mb-1">No apps on this key</h3>
            <p className="text-sm text-zinc-400 mb-4 max-w-sm mx-auto">
              The App Store Connect key you connected has no apps visible. This
              usually means the key's role isn't granted access to any app, or
              you haven't created an app record yet.
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
