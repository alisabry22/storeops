import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cross-Platform App Pricing — App Store + Google Play in One Tool",
  description:
    "Keep iOS and Android prices consistent worldwide with controlled policies, diff previews, Apple corrective restores, and reusable Google Play pricing snapshots.",
  alternates: { canonical: `${SITE_URL}/cross-platform-app-pricing` },
  openGraph: {
    title: "Cross-Platform App Pricing — App Store + Google Play in One Tool",
    description:
      "Keep iOS and Android prices consistent worldwide with one AI-assisted workflow.",
    url: `${SITE_URL}/cross-platform-app-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I keep App Store and Google Play prices in sync?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Export your current prices from both stores as CSV in StoreOps, run the same AI pricing strategy on each, and apply the results back. Apple prices snap to the nearest valid price tier; Google prices apply exactly. The result is consistent worldwide pricing across both platforms.",
      },
    },
    {
      "@type": "Question",
      name: "Why are my iOS and Android prices different per country?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The stores drift apart because Apple uses fixed price tiers while Google allows free-form prices, and each store auto-converts from your base price at different times with different exchange rates. Without periodic review, the same app can cost meaningfully more on one platform in some countries.",
      },
    },
    {
      "@type": "Question",
      name: "Do Flutter and React Native apps need cross-platform price management?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Cross-platform apps ship identical features on both stores, so price differences are hard to justify to users and complicate revenue analysis. A single repricing workflow across both stores keeps positioning consistent and saves doing every pricing exercise twice.",
      },
    },
  ],
};

export default function CrossPlatformPricingPage() {
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
        One Pricing Strategy. Both Stores.
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        If you ship with Flutter, React Native, or two native codebases, your
        pricing lives in two consoles that never talk to each other. StoreOps
        manages App Store Connect and Google Play with the same workflow — so
        one repricing decision lands everywhere.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The workflow</h2>
        <ol className="space-y-4">
          {[
            {
              step: "Export both stores",
              detail:
                "Current prices for every App Store territory (175) and Play region — two CSVs, same format.",
            },
            {
              step: "One controlled strategy for both",
              detail:
                "Pick a bounded policy for each product. Apple and Google use their own official baselines while StoreOps keeps the market intent consistent.",
            },
            {
              step: "Apply with previews on both sides",
              detail:
                "Apple prices snap to official points and corrective changes follow Apple’s schedule. Google prices are verified after apply and can return to a saved current storefront grid.",
            },
          ].map((s, i) => (
            <li key={s.step} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-400 font-mono text-sm">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold text-zinc-200">{s.step}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Same privacy model on both stores</h2>
        <p className="text-zinc-400 leading-relaxed">
          Your App Store Connect .p8 and your Google service-account key are
          both imported as non-extractable browser keys. Their raw key material
          is not exportable after import; they sign short-lived tokens locally.
          Store credentials are not uploaded to StoreOps.
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
        <p className="font-semibold text-lg mb-2">Both stores. One workflow.</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview on both platforms.
        </p>
        <div className="flex justify-center gap-3">
          <Link
            href="/connect"
            className="inline-block rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
          >
            Connect App Store →
          </Link>
          <Link
            href="/play"
            className="inline-block rounded-md border border-emerald-800 px-6 py-2.5 text-sm font-semibold text-emerald-400 hover:border-emerald-500 transition"
          >
            Connect Google Play →
          </Link>
        </div>
      </div>
    </main>
  );
}
