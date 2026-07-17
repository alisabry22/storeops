"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCredentials } from "@/lib/store";
import {
  LIFETIME_PRICE,
  LIFETIME_FULL_PRICE,
  YEARLY_PRICE,
  useCheckoutUrls,
} from "@/lib/license";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Store CTA: signed-out visitors get the sign-up modal and land on the
 * connect page right after; signed-in (or local-mode) users go straight there.
 */
function StoreCta({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  const cls = primary
    ? "btn-glow block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
    : "block w-full text-center rounded-md border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:border-emerald-500 transition";
  if (!clerkEnabled)
    return (
      <Link href={href} className={cls}>
        {label}
      </Link>
    );
  return <GatedCta href={href} label={label} cls={cls} />;
}

function GatedCta({
  href,
  label,
  cls,
}: {
  href: string;
  label: string;
  cls: string;
}) {
  const { isSignedIn, isLoaded } = useUser();
  if (isLoaded && !isSignedIn) {
    return (
      <SignUpButton mode="modal" forceRedirectUrl={href}>
        <button className={`${cls} w-full`}>{label}</button>
      </SignUpButton>
    );
  }
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  );
}

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
    title: "Controlled pricing policies",
    body: "Start from current localized prices, choose a bounded market policy, and preview every change before it reaches a real Apple tier.",
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
    title: "Store-aware pricing history",
    body: "Return Google Play to any saved storefront grid. On Apple, cancel pending mistakes or schedule the previous prices back at the earliest permitted date.",
    saves: "your sanity",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect your stores",
    body: "Your credentials stay in your browser as non-extractable keys. They never become another thing to worry about.",
  },
  {
    n: "2",
    title: "Preview everything",
    body: "Every change is a dry run first. See the exact diff — current versus new — before anything touches a store.",
  },
  {
    n: "3",
    title: "Apply once",
    body: "One calm push updates every locale and territory. Save a named pricing snapshot first so you always have a verified recovery path.",
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

      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden border-b border-zinc-900 bg-[radial-gradient(50rem_28rem_at_75%_20%,rgba(16,185,129,0.13),transparent_70%)]">
        <div className="mx-auto grid min-h-[calc(100svh-3.5rem)] max-w-7xl items-center gap-10 px-6 py-12 lg:grid-cols-[0.8fr_1.2fr] lg:py-16">
          <div className="animate-fade-up">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">
              StoreOps · App Store + Google Play
            </p>
            <h1 className="max-w-xl text-4xl font-bold tracking-[-0.045em] leading-[1.02] sm:text-6xl">
              You shipped the app.
              <span className="block text-emerald-400">Release day is not for 175 storefronts.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-400">
              Update pricing, subscriptions, and &ldquo;What&apos;s New&rdquo; across your stores in one reviewable push — with diffs, progress, and corrective-change snapshots.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="w-48">
                <StoreCta href="/connect" label="Try it on my app →" primary />
              </div>
              <a
                href="#demo"
                className="rounded-md border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-300"
              >
                Watch the demo ↓
              </a>
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Connect free. Preview every change. Pay only when you&apos;re ready to apply.
            </p>
          </div>

          <figure id="demo" className="animate-fade-up [animation-delay:120ms]">
            <div className="overflow-hidden rounded-2xl border border-emerald-900/60 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <video
                controls
                playsInline
                preload="metadata"
                className="aspect-[1.63] w-full bg-zinc-950 object-contain"
              >
                <source src="/storeops-demo-web.mp4" type="video/mp4" />
                Your browser does not support embedded video.
              </video>
            </div>
            <figcaption className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span>A real walkthrough — no slides, no fake dashboard.</span>
              <span className="shrink-0 font-mono text-emerald-400">Watch it in full</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------- Pain / payoff ---------- */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">The release-day tax</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          The code is done. The console work is what steals your afternoon.
        </h2>
        <div className="mt-10 divide-y divide-zinc-800 border-y border-zinc-800">
          {[
            ["Release notes", "Open 40 locales. Paste the same update. Repeat.", "Update every locale from one table."],
            ["Regional pricing", "Click through country after country and hope every tier is valid.", "Import a sheet. Preview the diff. Apply once."],
            ["Subscription changes", "Touch one wrong setting and worry about existing subscribers.", "Review subscriber impact before scheduling a safe change."],
          ].map(([task, oldWay, newWay]) => (
            <div key={task} className="grid gap-2 py-5 sm:grid-cols-[0.7fr_1fr_1fr] sm:gap-6">
              <h3 className="font-semibold text-zinc-100">{task}</h3>
              <p className="text-sm leading-relaxed text-zinc-500">{oldWay}</p>
              <p className="text-sm leading-relaxed text-emerald-300">{newWay}</p>
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
          Diff previews, bulk applies, and rollback — for both stores.
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
              <li>✓ Connect App Store &amp; Google Play</li>
              <li>✓ Browse all apps, IAPs &amp; subscriptions</li>
              <li>✓ Preview every change as a diff</li>
              <li>✓ Export current prices as CSV</li>
              <li>✓ Generate bounded policy previews</li>
              <li className="text-zinc-600 mt-1">✗ Apply pricing changes</li>
              <li className="text-zinc-600">✗ Apply metadata changes</li>
              <li className="text-zinc-600">✗ Pricing snapshots &amp; restores</li>
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
                <span className="line-through text-zinc-500 text-xl font-normal mr-1">{LIFETIME_FULL_PRICE}</span>
                {LIFETIME_PRICE}
                <span className="text-sm font-normal text-zinc-500"> once</span>
              </p>
              <ul className="space-y-2 text-sm text-zinc-300">
                <li>✓ Everything in Pro, forever</li>
                <li>✓ App Store + Google Play — both stores</li>
                <li>✓ Bulk pricing — IAPs &amp; subscriptions</li>
                <li>✓ Bulk metadata across all locales</li>
                <li>✓ Controlled policy previews</li>
                <li>✓ Pricing snapshots &amp; restores</li>
                <li>✓ All future features included</li>
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
                One key, all your devices
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
              <li>✓ App Store + Google Play — both stores</li>
              <li>✓ Bulk pricing — IAPs &amp; subscriptions</li>
              <li>✓ Bulk metadata across all locales</li>
              <li>✓ Controlled policy previews</li>
              <li>✓ Pricing snapshots &amp; restores</li>
              <li>✓ Subscriber-safe subscription repricing</li>
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
              Cancel anytime · one key, all your devices
            </p>
          </div>
        </div>
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
        <p className="text-center text-xs text-zinc-500 mb-4">
          Built by an indie dev who got tired of clicking. 🛠 — Store
          <span className="text-emerald-500">Ops</span>
        </p>
        <div className="flex justify-center gap-5 text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400 transition">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-zinc-400 transition">
            Privacy
          </Link>
          <a
            href="mailto:support@storeops.dev"
            className="hover:text-zinc-400 transition"
          >
            support@storeops.dev
          </a>
        </div>
      </footer>
    </main>
  );
}
