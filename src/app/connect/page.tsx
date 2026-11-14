"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { useGpStore } from "@/lib/gp/store";
import { RequireAccount } from "@/components/RequireAccount";
import { AppleConnectCard, GoogleConnectCard } from "@/components/ConnectCards";
import { AppIcon } from "@/components/AppIcon";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useHydrated } from "@/lib/use-hydrated";
import { useSigningKey } from "@/lib/use-signing-key";

/**
 * Store connection hub: both stores side by side, one screen, no detours.
 * Saved IDs with a missing key show the same form in reconnect mode.
 */
export default function ConnectPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { credentials } = useCredentials();
  const gpCredentials = useGpStore((s) => s.gpCredentials);
  const ascKey = useSigningKey("asc-signing-key", hydrated && !!credentials, credentials);
  const gpKey = useSigningKey("gp-signing-key", hydrated && !!gpCredentials, gpCredentials);

  // Legacy installs keep the PEM in localStorage until KeyMigrator moves it.
  const appleReady = !!credentials && (ascKey === "present" || !!credentials.privateKeyPem);
  const googleReady = !!gpCredentials && gpKey === "present";

  useEffect(() => {
    if (appleReady) router.replace("/apps");
  }, [appleReady, router]);

  const checking =
    !hydrated ||
    (!!credentials && ascKey === "checking") ||
    (!!gpCredentials && gpKey === "checking");
  if (checking || appleReady) return <PageSkeleton />;

  return (
    <RequireAccount>
      <main id="main-content" className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
        <Link href="/" className="mb-10 inline-flex min-h-11 items-center text-lg font-bold tracking-tight">
          <span>Store<span className="text-emerald-400">Ops</span></span>
        </Link>

        <div className="mb-8 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Connect a store
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-400">
            Connect one store or both. Reading prices is free. Nothing changes in your store until you review a preview and confirm it.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-300">
            <AppIcon name="shield" className="size-4 text-emerald-400" />
            Your keys stay in this browser and are never sent to StoreOps.
          </p>
        </div>

        <div className="grid items-stretch gap-4 md:grid-cols-2">
          <AppleConnectCard
            reconnect={!!credentials && !appleReady}
            onConnected={() => router.push("/apps")}
          />
          {googleReady ? (
            <section className="card flex flex-col justify-between gap-6 p-6">
              <div>
                <p className="text-xs font-medium text-zinc-500">Android</p>
                <h2 className="mt-1 text-xl font-semibold text-zinc-50">Google Play</h2>
                <p className="mt-4 inline-flex items-center gap-2 text-sm text-emerald-300">
                  <AppIcon name="check" className="size-4" /> Connected as{" "}
                  <span className="break-all font-mono text-xs">{gpCredentials.clientEmail}</span>
                </p>
              </div>
              <Link
                href="/play"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 px-4 text-sm font-semibold text-emerald-300 transition hover:border-emerald-500 hover:text-emerald-200"
              >
                Open Google Play <AppIcon name="arrow" className="size-4" />
              </Link>
            </section>
          ) : (
            <GoogleConnectCard
              reconnect={!!gpCredentials}
              onConnected={() => router.push("/play")}
            />
          )}
        </div>
      </main>
    </RequireAccount>
  );
}
