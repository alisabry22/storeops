import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Bulk Subscription Prices — Reprice All 175 Territories Without Breaking Subscribers",
  description:
    "Change App Store subscription prices across all 175 territories at once. Existing subscribers are always grandfathered. CSV import, AI repricing, snapshots and rollback.",
  alternates: { canonical: `${SITE_URL}/subscription-pricing` },
  openGraph: {
    title: "Bulk Subscription Prices — Reprice All 175 Territories Without Breaking Subscribers",
    description:
      "Change App Store subscription prices across all 175 territories at once. Existing subscribers are always protected.",
    url: `${SITE_URL}/subscription-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I change App Store subscription prices in bulk?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. StoreOps uses the App Store Connect API to update subscription prices across all 175 territories. Export your current prices, reprice with AI, paste back, and apply in one operation.",
      },
    },
    {
      "@type": "Question",
      name: "Will changing subscription prices cancel existing subscribers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Apple grandfathers existing subscribers at the price they originally paid. When you raise prices, only new subscribers pay the new rate. Existing subscribers keep their plan until they cancel or it lapses.",
      },
    },
    {
      "@type": "Question",
      name: "What happens if I schedule a subscription price change?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "When a current price already exists for a territory, StoreOps automatically schedules the new price for the next day. Apple requires this — you cannot replace a current price with immediate effect, only schedule a future change.",
      },
    },
  ],
};

export default function SubscriptionPricingPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block">
        ← StoreOps
      </Link>

      <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
        Bulk Subscription Prices
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        Repricing a subscription across 175 territories is the most nerve-wracking job in App
        Store Connect. StoreOps automates it — with existing subscribers always protected.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Why subscription repricing is so painful</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          App Store subscriptions have no bulk pricing interface. Each territory requires a
          separate price change. Each change can be scheduled or immediate, but you have to
          decide per-territory. At 175 storefronts, that is 175 individual decisions, clicks,
          and saves.
        </p>
        <p className="text-zinc-400 leading-relaxed mb-4">
          Apple&apos;s rules make it more complex: you cannot delete a current price, only schedule
          a replacement. Existing subscribers are grandfathered automatically, but only if you
          follow the correct API flow. Get it wrong and you risk a 409 error mid-update,
          leaving prices inconsistent across markets.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          StoreOps handles all of this automatically — scheduling, rate-limiting, retries, and
          rollback — so you can reprice confidently in minutes.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Existing subscribers are always protected</h2>
        <p className="text-zinc-400 leading-relaxed">
          Apple grandfathers every existing subscriber at the price they originally agreed to.
          When you raise a subscription price, only new subscribers pay the new rate. StoreOps
          makes this the default — the scheduling logic automatically handles the Apple API
          constraint so your subscriber base is never disrupted.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How it works</h2>
        <div className="space-y-5">
          {[
            {
              title: "Select your subscription",
              body: "StoreOps loads all your subscription groups and products. Pick one — monthly, annual, or any tier — and see the current prices for every territory at a glance.",
            },
            {
              title: "Export and reprice with AI",
              body: "Export your current prices as CSV. The built-in AI prompt asks for PPP-adjusted pricing so your subscription is fairly priced in every market — affordable in Egypt, standard in the US.",
            },
            {
              title: "Preview the diff",
              body: "Paste the AI output back. See exactly what changes before anything touches Apple. Prices snap automatically to valid Apple subscription tiers.",
            },
            {
              title: "Apply — StoreOps handles the scheduling",
              body: "For each territory, StoreOps cancels any existing future scheduled change, then posts your new price — immediate if no current price exists, scheduled for tomorrow if one does. Automatic retry on rate limits.",
            },
            {
              title: "Roll back if needed",
              body: "A snapshot is saved automatically before every apply. One click restores every territory to exactly where it was.",
            },
          ].map((s, i) => (
            <div key={s.title} className="flex gap-5">
              <span className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-400 font-mono text-sm">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Frequently asked questions</h2>
        <div className="space-y-6">
          {faqSchema.mainEntity.map((q) => (
            <div key={q.name}>
              <h3 className="font-semibold mb-1">{q.name}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{q.acceptedAnswer.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6 text-center">
        <p className="font-semibold text-lg mb-2">Reprice subscriptions in minutes</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview. No account required — just your App Store Connect key.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
        >
          Try StoreOps free →
        </Link>
      </div>
    </main>
  );
}
