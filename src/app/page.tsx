"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useCredentials } from "@/lib/store";
import {
  LIFETIME_FULL_PRICE,
  LIFETIME_PRICE,
  YEARLY_PRICE,
  useCheckoutUrls,
} from "@/lib/license";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function StoreCta({ href, label, primary = false }: { href: string; label: string; primary?: boolean }) {
  const className = primary
    ? "btn-glow inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
    : "inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-300";
  if (!clerkEnabled) return <Link href={href} className={className}>{label}</Link>;
  return <GatedCta href={href} label={label} className={className} />;
}

function GatedCta({ href, label, className }: { href: string; label: string; className: string }) {
  const { isSignedIn, isLoaded } = useUser();
  if (isLoaded && !isSignedIn) {
    return (
      <SignUpButton mode="modal" forceRedirectUrl={href}>
        <button className={className}>{label}</button>
      </SignUpButton>
    );
  }
  return <Link href={href} className={className}>{label}</Link>;
}

function OpenAppLink() {
  return (
    <Link href="/apps" className="rounded-md bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300">
      Open StoreOps
    </Link>
  );
}

function HomeNav({ connected }: { connected: boolean }) {
  if (!clerkEnabled) return connected ? <OpenAppLink /> : <StoreCta href="/connect" label="Connect a store" />;
  return <ClerkNav connected={connected} />;
}

function ClerkNav({ connected }: { connected: boolean }) {
  const { isSignedIn, isLoaded } = useUser();
  if (!isLoaded) return null;
  if (isSignedIn || connected) return <OpenAppLink />;
  return (
    <SignInButton mode="modal">
      <button className="text-sm text-zinc-300 transition hover:text-emerald-300">Sign in</button>
    </SignInButton>
  );
}

const PRICE_ROWS = [
  { flag: "🇺🇸", market: "United States", current: "$29.99", next: "$29.99", movement: "Anchor" },
  { flag: "🇪🇬", market: "Egypt", current: "E£699", next: "E£499", movement: "−28.6%" },
  { flag: "🇮🇳", market: "India", current: "₹1,999", next: "₹1,499", movement: "−25.0%" },
  { flag: "🇩🇪", market: "Germany", current: "€29.99", next: "€32.99", movement: "+10.0%" },
];

function PricingCommandSurface() {
  return (
    <div className="command-surface relative overflow-hidden rounded-2xl border border-zinc-700/80 bg-[#0b0d0c] shadow-[0_36px_100px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Worldwide price change</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">VoCash Pro · Annual</p>
        </div>
        <span className="rounded-full border border-emerald-900 bg-emerald-950/60 px-2.5 py-1 font-mono text-[10px] text-emerald-300">175 loaded</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] border-b border-zinc-800 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600 sm:px-5">
        <span>Storefront</span><span className="w-24 text-right">Current</span><span className="w-24 text-right">Will set</span>
      </div>
      <div>
        {PRICE_ROWS.map((row, index) => (
          <div key={row.market} className="price-command-row grid grid-cols-[1fr_auto_auto] items-center border-b border-zinc-900 px-4 py-3.5 sm:px-5" style={{ animationDelay: `${420 + index * 180}ms` }}>
            <div className="min-w-0">
              <p className="truncate text-sm text-zinc-200"><span className="mr-2">{row.flag}</span>{row.market}</p>
              <p className="mt-1 font-mono text-[10px] text-zinc-600">{row.movement}</p>
            </div>
            <span className="w-24 text-right font-mono text-xs text-zinc-500">{row.current}</span>
            <span className="w-24 text-right font-mono text-xs font-medium text-emerald-300">{row.next}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-px bg-zinc-800 sm:grid-cols-3">
        {[
          ["01", "Snapshot saved", "Recovery point ready"],
          ["02", "Store accepted", "Official API response"],
          ["03", "Grid verified", "Live prices match"],
        ].map(([number, title, detail], index) => (
          <div key={number} className="workflow-state bg-zinc-950 px-4 py-3" style={{ animationDelay: `${1.25 + index * 0.45}s` }}>
            <p className="font-mono text-[10px] text-emerald-500">{number}</p>
            <p className="mt-1 text-xs font-medium text-zinc-200">{title}</p>
            <p className="mt-0.5 text-[10px] text-zinc-600">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const OPERATIONS = [
  ["Regional pricing", "One anchor, every storefront", "Build from Apple or Google’s official regional baseline, apply a controlled market policy, and review every local amount."],
  ["Subscription changes", "Know who is affected before Save", "Separate new-customer pricing from subscriber cohorts and preservation choices instead of guessing what the store will do."],
  ["Release metadata", "One release note, every locale", "Edit descriptions, promotional text, keywords, and What’s New without opening the same screen forty times."],
  ["Pricing history", "Leave yourself a way back", "Save the full grid before applying. Restore Google’s current storefront grid or schedule the corrective Apple change the store permits."],
];

export default function LandingPage() {
  const { credentials } = useCredentials();
  const { yearly: yearlyUrl, lifetime: lifetimeUrl } = useCheckoutUrls();

  return (
    <main className="w-full overflow-hidden">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-zinc-950/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-[-0.03em] text-white">Store<span className="text-emerald-400">Ops</span></Link>
          <nav className="hidden items-center gap-7 text-sm text-zinc-500 md:flex">
            <a href="#workflow" className="transition hover:text-zinc-200">Workflow</a>
            <a href="#safety" className="transition hover:text-zinc-200">Safety</a>
            <a href="#pricing" className="transition hover:text-zinc-200">Pricing</a>
          </nav>
          <HomeNav connected={!!credentials} />
        </div>
      </header>

      <section className="relative min-h-svh border-b border-zinc-900 pt-16">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-12 px-6 py-14 lg:grid-cols-[0.82fr_1.18fr] lg:py-20">
          <div className="animate-fade-up">
            <p className="mb-7 font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">The control room after you ship</p>
            <h1 className="max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.06em] text-white sm:text-7xl">
              175 storefronts.
              <span className="mt-2 block text-zinc-500">One verified change.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">
              Your app is ready. Do not lose the afternoon clicking through pricing, subscriptions, and release metadata in two different consoles.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <StoreCta href="/connect" label="Inspect my live prices — free" primary />
              <a href="#demo" className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-zinc-400 transition hover:text-white">See the real workflow ↓</a>
            </div>
            <p className="mt-4 text-xs text-zinc-600">Read and preview for free. Nothing changes until you review and apply.</p>
          </div>
          <div className="animate-fade-up lg:pl-4 [animation-delay:140ms]">
            <PricingCommandSurface />
            <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">Preview → snapshot → apply → verify</p>
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">Finish the release</p>
            <h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em] text-white sm:text-5xl">The console work is real work. Compress it.</h2>
            <p className="mt-5 max-w-md leading-relaxed text-zinc-500">StoreOps gives each repetitive store operation one place, one review, and one decisive action.</p>
          </div>
          <div className="border-t border-zinc-800">
            {OPERATIONS.map(([eyebrow, title, body], index) => (
              <div key={eyebrow} className="group grid gap-3 border-b border-zinc-800 py-7 sm:grid-cols-[3rem_0.8fr_1.2fr] sm:gap-6">
                <span className="font-mono text-xs text-zinc-700 transition group-hover:text-emerald-500">0{index + 1}</span>
                <div><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">{eyebrow}</p><h3 className="mt-2 text-lg font-medium text-zinc-100">{title}</h3></div>
                <p className="text-sm leading-relaxed text-zinc-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-900 bg-zinc-950/60">
        <div className="mx-auto grid max-w-6xl divide-y divide-zinc-800 px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["Read first", "Connect both stores and inspect every product without paying."],
            ["Review everything", "Current and proposed prices stay side by side until you approve."],
            ["Pay for execution", "Pro unlocks authorized writes, history, and recovery workflows."],
          ].map(([title, body]) => (
            <div key={title} className="py-8 sm:px-8 sm:first:pl-0 sm:last:pr-0"><h3 className="text-sm font-semibold text-zinc-200">{title}</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">{body}</p></div>
          ))}
        </div>
      </section>

      <section id="safety" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">Pricing infrastructure, not spreadsheet roulette</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">Fast is useful only when the result is trustworthy.</h2>
        </div>
        <div className="mt-14 grid gap-10 border-t border-zinc-800 pt-10 md:grid-cols-3">
          <div><p className="font-mono text-xs text-emerald-400">01 · Controlled</p><h3 className="mt-3 font-semibold text-zinc-100">AI configures the policy, not the prices</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">Price generation is deterministic, capped per territory, and visible before apply.</p></div>
          <div><p className="font-mono text-xs text-emerald-400">02 · Recoverable</p><h3 className="mt-3 font-semibold text-zinc-100">The old grid is saved first</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">Google restore points return current storefront pricing. Apple changes follow Apple’s scheduling and subscriber rules.</p></div>
          <div><p className="font-mono text-xs text-emerald-400">03 · Authorized</p><h3 className="mt-3 font-semibold text-zinc-100">Paid writes are enforced on the server</h3><p className="mt-2 text-sm leading-relaxed text-zinc-500">Raw store keys remain non-extractable in your browser; only short-lived store tokens cross the proxy.</p></div>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-6xl px-6 pb-24 sm:pb-32">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">No slides. No mock data.</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Watch one product go from console chore to reviewed change.</h2></div><span className="font-mono text-xs text-zinc-600">Real StoreOps walkthrough</span></div>
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
          <video controls playsInline preload="metadata" className="aspect-[1.63] w-full object-contain"><source src="/storeops-demo-web.mp4" type="video/mp4" />Your browser does not support embedded video.</video>
        </div>
      </section>

      <section id="pricing" className="border-t border-zinc-900 bg-[#080a09]">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-28">
          <div className="mx-auto max-w-2xl text-center"><p className="font-mono text-xs uppercase tracking-[0.18em] text-emerald-400">Pay less than one wasted afternoon</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-white">Inspect for free. Upgrade when the change is ready.</h2></div>
          <div className={`mx-auto mt-12 grid max-w-4xl gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 ${lifetimeUrl ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <div className="bg-zinc-950 p-7"><p className="text-sm font-semibold text-zinc-300">Free</p><p className="mt-3 text-4xl font-semibold text-white">$0</p><p className="mt-3 text-sm text-zinc-500">See the work before buying.</p><ul className="mt-7 space-y-3 text-sm text-zinc-400"><li>Connect Apple and Google</li><li>Browse apps, IAPs, and subscriptions</li><li>Generate and review pricing diffs</li><li>Export current prices</li></ul><div className="mt-8"><StoreCta href="/connect" label="Inspect my stores" /></div></div>
            <div className="relative bg-emerald-950/30 p-7"><span className="absolute right-5 top-5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">For shipping developers</span><p className="text-sm font-semibold text-emerald-300">Pro</p><p className="mt-3 text-4xl font-semibold text-white">{YEARLY_PRICE}<span className="text-sm font-normal text-zinc-500"> / year</span></p><p className="mt-3 text-sm text-zinc-400">Execute the reviewed work.</p><ul className="mt-7 space-y-3 text-sm text-zinc-300"><li>Everything in Free</li><li>Authorized Apple + Google writes</li><li>Pricing history and recovery flows</li><li>Bulk metadata across locales</li><li>AI policy configuration</li></ul><a href={yearlyUrl} target="_blank" rel="noopener noreferrer" className="btn-glow mt-8 block rounded-md bg-emerald-400 px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300">Finish releases faster</a></div>
            {lifetimeUrl && <div className="bg-zinc-950 p-7"><p className="text-sm font-semibold text-zinc-300">Founding lifetime</p><p className="mt-3 text-4xl font-semibold text-white">{LIFETIME_FULL_PRICE && LIFETIME_FULL_PRICE !== LIFETIME_PRICE && <span className="mr-2 text-lg font-normal text-zinc-600 line-through">{LIFETIME_FULL_PRICE}</span>}{LIFETIME_PRICE}</p><p className="mt-3 text-sm text-zinc-500">The current founding offer, paid once.</p><ul className="mt-7 space-y-3 text-sm text-zinc-400"><li>Everything in Pro</li><li>Apple and Google included</li><li>One license across your devices</li><li>Future StoreOps releases</li></ul><a href={lifetimeUrl} target="_blank" rel="noopener noreferrer" className="mt-8 block rounded-md border border-zinc-700 px-4 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:border-emerald-600 hover:text-emerald-300">Get founding lifetime</a></div>}
          </div>
          <p className="mt-6 text-center text-xs text-zinc-600">Existing paid customers keep their current entitlement.</p>
        </div>
      </section>

      <section className="border-t border-zinc-900 px-6 py-20 text-center"><h2 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">Your next release can end when the code is done.</h2><div className="mt-8"><StoreCta href="/connect" label="Inspect my live stores — free" primary /></div></section>

      <footer className="border-t border-zinc-900"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 px-6 py-8 text-xs text-zinc-600 sm:flex-row"><p>Store<span className="text-emerald-500">Ops</span> · App Store and Google Play operations</p><div className="flex flex-wrap justify-center gap-5"><Link href="/terms" className="hover:text-zinc-300">Terms</Link><Link href="/privacy" className="hover:text-zinc-300">Privacy</Link><Link href="/google-play-bulk-pricing" className="hover:text-zinc-300">Google pricing</Link><Link href="/subscription-pricing" className="hover:text-zinc-300">Subscription pricing</Link><a href="mailto:support@storeops.dev" className="hover:text-zinc-300">Support</a></div></div></footer>
    </main>
  );
}
