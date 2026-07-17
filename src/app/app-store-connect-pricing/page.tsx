import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Connect Pricing — Manage Prices Across All 175 Territories",
  description:
    "A better way to manage App Store Connect pricing. Set app prices, subscription prices, and IAP prices across all 175 territories — with controlled pricing policies, strict CSV import, and reviewable corrective changes.",
  alternates: { canonical: `${SITE_URL}/app-store-connect-pricing` },
  openGraph: {
    title: "App Store Connect Pricing — Manage Prices Across All 175 Territories",
    description:
      "Manage App Store Connect pricing for all 175 territories — apps, subscriptions, and IAPs — in one place.",
    url: `${SITE_URL}/app-store-connect-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I change App Store Connect pricing for all countries?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In App Store Connect, you have to set prices per country manually. StoreOps automates this: export your current prices as CSV, reprice with AI, paste back, and apply to all 175 territories at once via the App Store Connect API.",
      },
    },
    {
      "@type": "Question",
      name: "What types of pricing can I manage in App Store Connect?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "App Store Connect has three types of pricing: app pricing (the base price of your app), subscription pricing (recurring in-app subscriptions), and in-app purchase pricing (one-time purchases, consumables, and lifetime access). StoreOps manages all three.",
      },
    },
    {
      "@type": "Question",
      name: "Can I set different App Store prices per country?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. App Store Connect supports manual pricing per territory. You can set a different price for the US, Egypt, Germany, Japan, and every other storefront. StoreOps makes this practical by letting you manage all 175 territories in one CSV operation.",
      },
    },
  ],
};

export default function AppStoreConnectPricingPage() {
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
        App Store Connect Pricing
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        App Store Connect pricing covers three distinct areas — app price, subscription prices,
        and IAP prices — each across 175 territories. StoreOps manages all three from a single
        interface.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Three types of App Store pricing</h2>
        <div className="space-y-4">
          {[
            {
              type: "App pricing",
              href: "/bulk-pricing",
              description:
                "The base price of downloading your app. Set to Free (Tier 0) or any of Apple's price tiers. Can be changed at any time. Affects all users purchasing the app for the first time.",
              note: "Supported for all 175 storefronts",
            },
            {
              type: "Subscription pricing",
              href: "/subscription-pricing",
              description:
                "Recurring prices for auto-renewable subscriptions. Each subscription product has its own price per territory, with explicit existing-subscriber handling for eligible increases and clear decrease warnings.",
              note: "Per subscription, per territory",
            },
            {
              type: "In-App Purchase pricing",
              href: null,
              description:
                "One-time prices for consumables, non-consumables (like lifetime access), and non-renewing subscriptions. Set via a price schedule that applies to all territories at once.",
              note: "One POST sets all territories",
            },
          ].map((t) => (
            <div key={t.type} className="rounded-lg border border-zinc-800 p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-zinc-200">{t.type}</h3>
                <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-0.5 whitespace-nowrap">
                  {t.note}
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed mb-3">{t.description}</p>
              {t.href && (
                <Link href={t.href} className="text-xs text-emerald-400 hover:text-emerald-300">
                  Learn more →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Why App Store Connect pricing is painful</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          App Store Connect has no bulk pricing interface. Every territory requires a separate
          action. For 175 territories across three pricing types, a full repricing job means
          hundreds of individual clicks — and no undo button if something goes wrong.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          StoreOps is the missing bulk pricing layer for App Store Connect. Export your current
          prices, reprice with AI for local purchasing power, import back, review the diff, and
          apply in one operation. Every change is snapshotted first so you can roll back in one
          click.
        </p>
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
        <p className="font-semibold text-lg mb-2">Manage all your App Store pricing in one place</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview. No account required — just your .p8 key.
        </p>
        <Link
          href="/connect"
          className="inline-block rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
        >
          Try StoreOps free →
        </Link>
      </div>
    </main>
  );
}
