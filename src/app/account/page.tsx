"use client";

import { useState } from "react";
import Link from "next/link";
import { RequireAccount } from "@/components/RequireAccount";
import { useAccount } from "@/lib/account";
import { useIsPro, useLicense } from "@/lib/license";
import { PaywallModal } from "@/components/Paywall";

const BILLING_PORTAL_URL =
  process.env.NEXT_PUBLIC_LS_CUSTOMER_PORTAL_URL ??
  "https://app.lemonsqueezy.com/my-orders";

export default function AccountPage() {
  return (
    <RequireAccount>
      <AccountContent />
    </RequireAccount>
  );
}

function AccountContent() {
  const { plan, email } = useAccount();
  const isPro = useIsPro();
  const { status: deviceStatus, productName, deactivate } = useLicense();
  const [paywallOpen, setPaywallOpen] = useState(false);

  const planLabel =
    plan === "lifetime" ? "Lifetime" : plan === "pro" ? "Pro" : "Free";

  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      <Link
        href="/apps"
        className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block"
      >
        ← Back to app
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-10">Account</h1>

      <div className="space-y-6">
        {/* ---------- Plan ---------- */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-lg">Plan</h2>
            <span
              className={`text-xs rounded-full px-3 py-1 border ${
                isPro
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                  : "border-zinc-700 text-zinc-400"
              }`}
            >
              {isPro && plan === "free" ? "Pro (device license)" : planLabel}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            {email ?? "—"}
          </p>

          {isPro ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Every apply is unlocked on both stores. Invoices, receipts,
                and cancellation live in the Lemon Squeezy billing portal —
                sign in there with your purchase email.
              </p>
              <a
                href={BILLING_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-500 transition"
              >
                Manage billing →
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Free covers browsing, previews, and exports. Pro unlocks
                applying changes — pricing, metadata, subscriptions — on both
                stores.
              </p>
              <button
                onClick={() => setPaywallOpen(true)}
                className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
              >
                Upgrade to Pro
              </button>
            </div>
          )}
        </div>

        {/* ---------- Device license (legacy buyers) ---------- */}
        {deviceStatus === "active" && (
          <div className="card p-6">
            <h2 className="font-semibold text-lg mb-1">Device license</h2>
            <p className="text-sm text-zinc-400 leading-relaxed mb-3">
              {productName ?? "StoreOps Pro"} is active on this device via
              license key. It has been linked to your account, so Pro follows
              you to other devices too.
            </p>
            <button
              onClick={deactivate}
              className="text-sm text-zinc-500 hover:text-red-400 transition"
            >
              Release this device&apos;s license
            </button>
          </div>
        )}

        {/* ---------- Data ---------- */}
        <div className="card p-6">
          <h2 className="font-semibold text-lg mb-1">Your data</h2>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Store credentials live only in this browser — disconnecting a
            store deletes its signing key immediately. To delete your account
            and synced snapshots, email{" "}
            <a
              href="mailto:support@storeops.dev"
              className="text-emerald-400 hover:text-emerald-300"
            >
              support@storeops.dev
            </a>
            . See the{" "}
            <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300">
              privacy policy
            </Link>{" "}
            for the full picture.
          </p>
        </div>
      </div>

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </main>
  );
}
