"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCredentials } from "@/lib/store";
import {
  LIFETIME_PRICE,
  YEARLY_PRICE,
  useCheckoutUrls,
} from "@/lib/license";
import { SignInButton, useUser } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function OpenAppLink() {
  return (
    <Link
      href="/apps"
      className="rounded-md bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
    >
      Open app →
    </Link>
  );
}

function HomeNav({ connected }: { connected: boolean }) {
  // Without Clerk (local-only installs), still surface the app entry point
  if (!clerkEnabled) return connected ? <OpenAppLink /> : null;
  return <ClerkNav connected={connected} />;
}

function ClerkNav({ connected }: { connected: boolean }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return connected ? <OpenAppLink /> : null;
  if (isSignedIn || connected) return <OpenAppLink />;
  return (
    <SignInButton mode="modal">
      <button className="text-sm text-zinc-300 hover:text-emerald-400 transition">
        Sign in
      </button>
    </SignInButton>
  );
}

const FEATURES = [
  {
    emoji: "📝",
    title: "Bulk metadata",
    body: "Description, keywords, promo text, What's New — edited across every locale in one table. “Apply to all” and go.",
    saves: "~1h per release",
  },
  {
    emoji: "🤖",
    title: "AI repricing loop",
    body: "Export your prices as CSV, let ChatGPT or Claude reprice for purchasing power, paste back. We snap every price to a real Apple tier.",
    saves: "~1 afternoon",
  },
  {
    emoji: "💳",
    title: "Subscription pricing",
    body: "Reprice subscriptions across 175 territories with existing subscribers protected by default. The scariest job in ASC, made boring.",
    saves: "~2h per tier",
  },
  {
    emoji: "⏪",
    title: "Snapshots & rollback",
    body: "Every apply saves a snapshot first, automatically. Botched an import? One click puts every price back exactly as it was.",
    saves: "your sanity",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect your key",
    body: "Your .p8 becomes a non-extractable browser key. It physically cannot be read back — not even by our code.",
  },
  {
    n: "2",
    title: "Preview everything",
    body: "Every change is a dry run first. See the exact diff — current vs. new — before anything touches Apple.",
  },
  {
    n: "3",
    title: "Apply once",
    body: "One click writes all locales and territories. A snapshot is saved automatically so you can always roll back.",
  },
];

export default function LandingPage() {
  const { credentials } = useCredentials();
  const { yearly: yearlyUrl, lifetime: lifetimeUrl } = useCheckoutUrls();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) return null;

  return (
    <main className="w-full">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-30 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold text-zinc-100 tracking-tight">StoreOps</span>
          <HomeNav connected={!!credentials} />
        </div>
      </header>

      {/* ---------- Hero + connect ---------- */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-start">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-900/70 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Built by an indie dev, for indie devs
          </p>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Update all 175 storefronts
            <br />
            <span className="text-emerald-400">in one push.</span>
          </h1>

          <p className="mt-5 text-lg text-zinc-400 leading-relaxed">
            Pricing, subscriptions, and metadata for App Store Connect — see
            the exact diff before anything goes live, apply once, roll back
            anytime. What takes{" "}
            <span className="text-zinc-200 font-semibold">an afternoon of clicking</span>{" "}
            takes <span className="text-emerald-400 font-semibold">2 minutes</span>.
          </p>

          <ul className="mt-8 space-y-3 text-[15px] text-zinc-300">
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                &ldquo;What&apos;s New&rdquo; in 40 locales —{" "}
                <span className="text-zinc-500 line-through">1 hour</span>{" "}
                <span className="text-emerald-400 font-semibold">1 click</span>
              </span>
            </li>
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                Reprice every storefront for local purchasing power —{" "}
                <span className="text-zinc-500 line-through">an afternoon</span>{" "}
                <span className="text-emerald-400 font-semibold">2 minutes</span>
              </span>
            </li>
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                Change subscription prices{" "}
                <span className="text-zinc-200 font-medium">
                  without touching existing subscribers
                </span>
              </span>
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-2">
            {["175 storefronts", "40+ locales", "App Store + Google Play", "100% key-private"].map(
              (chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 font-mono"
                >
                  {chip}
                </span>
              )
            )}
          </div>
        </div>

        {/* Get-started card */}
        <div className="card card-hero p-6 animate-fade-up lg:sticky lg:top-24">
          <h2 className="font-semibold text-lg mb-1">Try it on your app — free</h2>
          <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
            Connect either store and browse, preview, and export everything.
            No credit card. Your keys become{" "}
            <strong className="text-zinc-200">non-extractable browser keys</strong>{" "}
            — they never touch our servers.
          </p>

          <div className="space-y-2.5">
            <Link
              href="/connect"
              className="btn-glow block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
            >
               Connect App Store →
            </Link>
            <Link
              href="/play"
              className="block w-full text-center rounded-md border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:border-emerald-500 transition"
            >
              🤖 Connect Google Play →
            </Link>
          </div>

          <ul className="mt-5 space-y-1.5 text-xs text-zinc-400 border-t border-zinc-800 pt-4">
            <li>✓ Browse every app, price, and locale</li>
            <li>✓ Preview every change as a diff — dry run</li>
            <li>✓ Export CSVs and AI pricing prompts</li>
            <li className="text-zinc-500">Pro unlocks one-click applies</li>
          </ul>

          <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
            2-minute setup with an API key you create in your own store
            console — full instructions on the next screen.
          </p>
        </div>
      </section>

      {/* ---------- Stats strip ---------- */}
      <section className="max-w-5xl mx-auto px-6 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { n: "175", l: "storefronts" },
            { n: "40+", l: "locales" },
            { n: "20 min", l: "per token" },
            { n: "0", l: "servers store your key" },
          ].map((s) => (
            <div key={s.l} className="card p-4 animate-fade-up">
              <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">{s.n}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-8">
          Three steps. Zero key exposure.
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-400 font-mono text-sm mb-3">
                {s.n}
              </span>
              <h3 className="font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          Everything ASC makes painful
        </h2>
        <p className="text-zinc-400 mb-8">
          Time saved is money in your pocket. That&apos;s the whole product.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 group hover:border-emerald-800/60 transition">
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{f.emoji}</span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded-full px-2.5 py-0.5">
                  saves {f.saves}
                </span>
              </div>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Security ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="card card-hero p-7">
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            🔐 Your key can&apos;t leak. The browser won&apos;t allow it.
          </h2>
          <p className="text-zinc-400 mb-6 max-w-2xl leading-relaxed">
            An App Store Connect key can rewrite your whole business — so we
            designed StoreOps around never having it.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Non-extractable key</p>
              <p className="text-zinc-400 leading-relaxed">
                Your .p8 is imported as a WebCrypto key that can sign but never
                be exported. XSS, extensions, even our own code — nothing can
                read it back.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">20-minute tokens</p>
              <p className="text-zinc-400 leading-relaxed">
                Only short-lived signed tokens ever cross the wire, over TLS.
                The proxy exists solely because Apple blocks browser CORS.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Keys never stored</p>
              <p className="text-zinc-400 leading-relaxed">
                Your keys never touch our servers — accounts only sync
                snapshots and preferences. The code is public — audit the
                whole path yourself.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-8 text-center">
          Simple pricing. Both stores included.
        </h2>
        <div
          className={`grid gap-4 mx-auto ${
            lifetimeUrl
              ? "sm:grid-cols-3 max-w-4xl"
              : "sm:grid-cols-2 max-w-3xl"
          }`}
        >
          <div className="card p-6">
            <p className="font-semibold text-lg mb-1">Free</p>
            <p className="text-3xl font-bold mb-4">
              $0
              <span className="text-sm font-normal text-zinc-500"> forever</span>
            </p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>✓ Connect &amp; browse everything</li>
              <li>✓ Preview every change (dry run)</li>
              <li>✓ Export prices &amp; AI prompts</li>
              <li className="text-zinc-500">✗ Applying changes to Apple</li>
            </ul>
          </div>
          {lifetimeUrl && (
            <div className="card card-hero p-6 relative">
              <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold text-zinc-950">
                Pay once, own it
              </span>
              <p className="font-semibold text-lg mb-1 text-emerald-400">
                Lifetime
              </p>
              <p className="text-3xl font-bold mb-4">
                {LIFETIME_PRICE}
                <span className="text-sm font-normal text-zinc-500"> once</span>
              </p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>✓ Everything in Pro, forever</li>
                <li>✓ All future features included</li>
                <li>✓ No renewal, no subscription</li>
                <li>✓ All 175 storefronts, all your apps</li>
              </ul>
              <a
                href={lifetimeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-glow mt-5 block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
              >
                Get Lifetime
              </a>
              <p className="mt-3 text-center text-xs text-zinc-400">
                <span className="text-emerald-400">14-day refund</span> · one key, all your devices
              </p>
            </div>
          )}
          <div className={`card p-6 relative ${lifetimeUrl ? "" : "card-hero"}`}>
            {!lifetimeUrl && (
              <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold text-zinc-950">
                For shipping devs
              </span>
            )}
            <p className="font-semibold text-lg mb-1 text-emerald-400">Pro</p>
            <p className="text-3xl font-bold mb-4">
              {YEARLY_PRICE}
              <span className="text-sm font-normal text-zinc-500"> /year</span>
            </p>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>✓ Every apply — metadata, prices, subscriptions</li>
              <li>✓ Snapshots &amp; one-click rollback</li>
              <li>✓ Subscriber-safe subscription repricing</li>
              <li>✓ All 175 storefronts, all your apps</li>
            </ul>
            <a
              href={yearlyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-5 block w-full text-center rounded-md px-4 py-2.5 text-sm font-semibold transition ${
                lifetimeUrl
                  ? "border border-emerald-800 text-emerald-400 hover:border-emerald-500"
                  : "btn-glow bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              }`}
            >
              Get Pro
            </a>
            <p className="mt-3 text-center text-xs text-zinc-400">
              <span className="text-emerald-400">14-day refund</span> · cancel anytime · one key, all your devices
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          One botched manual price update costs more than a year of StoreOps.
        </p>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="max-w-5xl mx-auto px-6 py-10 border-t border-zinc-900 mt-8">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6">
          {[
            { href: "/bulk-pricing", label: "Bulk App Pricing" },
            { href: "/subscription-pricing", label: "Subscription Pricing" },
            { href: "/metadata-tool", label: "Metadata Tool" },
            { href: "/localization", label: "App Store Localization" },
            { href: "/asc-api", label: "ASC API" },
            { href: "/asc-automation", label: "ASC Automation" },
            { href: "/csv-import", label: "CSV Import" },
            { href: "/app-store-connect-pricing", label: "ASC Pricing" },
            { href: "/google-play-bulk-pricing", label: "Play Bulk Pricing" },
            { href: "/play-console-pricing", label: "Play Console Pricing" },
            { href: "/cross-platform-app-pricing", label: "Cross-Platform Pricing" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              {l.label}
            </a>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-500">
          Built by an indie dev who got tired of clicking. 🛠 — Store
          <span className="text-emerald-500">Ops</span>
        </p>
      </footer>
    </main>
  );
}
