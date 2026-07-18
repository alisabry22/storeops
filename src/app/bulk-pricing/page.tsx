import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Bulk App Store Pricing — Change All 175 Storefronts at Once",
  description:
    "Stop setting App Store prices one country at a time. StoreOps lets you bulk-update pricing across all 175 App Store territories in minutes — strict CSV import, controlled policy previews, and reviewable apply.",
  alternates: { canonical: `${SITE_URL}/bulk-pricing` },
  openGraph: {
    title: "Bulk App Store Pricing — Change All 175 Storefronts at Once",
    description:
      "Stop setting App Store prices one country at a time. StoreOps lets you bulk-update pricing across all 175 App Store territories in minutes.",
    url: `${SITE_URL}/bulk-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I change App Store prices in bulk?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. StoreOps uses the App Store Connect API to read all storefronts, produce a bounded and tier-valid preview, and apply the reviewed pricing schedule without country-by-country console work.",
      },
    },
    {
      "@type": "Question",
      name: "How long does bulk App Store pricing take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Typically 2–5 minutes for all 175 territories, including reviewing a controlled policy preview. Manually, the same job takes an afternoon.",
      },
    },
    {
      "@type": "Question",
      name: "Does StoreOps store my App Store Connect key?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Your .p8 key is imported as a non-extractable WebCrypto key in your browser's IndexedDB. Its raw material cannot be exported after import; it signs short-lived tokens locally and is not uploaded to StoreOps.",
      },
    },
    {
      "@type": "Question",
      name: "What price tiers does Apple support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Apple provides hundreds of price points per territory. StoreOps fetches all of them and automatically snaps your requested price to the nearest valid Apple tier, so you never set an invalid price.",
      },
    },
  ],
};

export default function BulkPricingPage() {
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
        Bulk App Store Pricing
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        Apple gives your app 175 storefronts. Pricing each one manually is an afternoon of
        clicking. StoreOps turns it into a two-minute CSV operation.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The problem with manual pricing</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          App Store Connect has no bulk pricing tool. To update your price across every
          territory you open each country, pick a tier, save, repeat — 175 times. Miss one
          and a market gets the wrong price. Do it wrong and you can&apos;t undo it from ASC.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          Indie developers lose an afternoon every time exchange rates shift, a new market
          opens, or they want to run a promotion. For studios with multiple apps, it scales
          to days of work per year.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How StoreOps bulk pricing works</h2>
        <div className="space-y-6">
          {[
            {
              step: "1",
              title: "Export your current prices",
              body: "One click exports all 175 territories as a CSV — territory code, currency, current price. Your starting point for any repricing job.",
            },
            {
              step: "2",
              title: "Configure a controlled policy",
              body: 'Copy the built-in AI prompt, paste it with your CSV into ChatGPT or Claude, get back a PPP-adjusted price sheet in seconds. The prompt asks for local purchasing power pricing — "99¢ in the US" becomes "12 EGP in Egypt" automatically.',
            },
            {
              step: "3",
              title: "Preview before applying",
              body: "Paste the AI output back. StoreOps shows you a full diff — current price vs. new price, per territory — and snaps each value to the nearest valid Apple tier. Nothing goes to Apple until you confirm.",
            },
            {
              step: "4",
              title: "Apply once, all territories",
              body: "One click. StoreOps writes all prices via the App Store Connect API with rate limiting and automatic retry. A snapshot is saved first so you can roll back in one click if needed.",
            },
          ].map((s) => (
            <div key={s.step} className="flex gap-5">
              <span className="flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-400 font-mono text-sm">
                {s.step}
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
        <p className="font-semibold text-lg mb-2">Ready to reprice in minutes?</p>
        <p className="text-sm text-zinc-400 mb-5">
          Connect your App Store Connect key and preview a bulk price update for free.
          No account required.
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
