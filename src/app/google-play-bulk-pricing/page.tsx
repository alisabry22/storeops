import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Google Play Bulk Pricing — Update Prices in Every Country at Once",
  description:
    "Bulk-edit Google Play prices across all regions from one strict CSV. In-app products and subscription base plans with controlled policy previews and reviewable corrective changes.",
  alternates: { canonical: `${SITE_URL}/google-play-bulk-pricing` },
  openGraph: {
    title: "Google Play Bulk Pricing — Update Prices in Every Country at Once",
    description:
      "Bulk-edit Google Play prices across all regions from one strict CSV — with controlled policy previews and corrective-change snapshots.",
    url: `${SITE_URL}/google-play-bulk-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I restore an older Google Play pricing configuration?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. StoreOps saves complete regional storefront pricing snapshots per product and base plan. Restoring a snapshot writes those saved regional amounts back and first saves the grid you are leaving, so the restore is itself reversible. Subscription legacy cohorts and completed billing are not rewritten.",
      },
    },
    {
      "@type": "Question",
      name: "How do I bulk update prices on Google Play?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Play Console has no bulk pricing interface — every region is edited one at a time. StoreOps uses the Google Play Developer API to read all your regional prices, lets you edit them as one CSV (or reprice with AI), shows a diff preview, and writes everything back in a single API call.",
      },
    },
    {
      "@type": "Question",
      name: "Can I change Google Play prices per country?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Google Play supports a separate price per region for in-app products and subscription base plans. Unlike Apple, prices are free-form (no fixed tiers) — any amount within Google's min/max for that currency works.",
      },
    },
    {
      "@type": "Question",
      name: "Does StoreOps store my Google service account key?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The service-account key is imported as a non-extractable browser key (WebCrypto, IndexedDB). It signs short-lived OAuth tokens locally and physically cannot be read back — it never touches StoreOps servers.",
      },
    },
  ],
};

export default function GooglePlayBulkPricingPage() {
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
        Google Play Bulk Pricing
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        Play Console makes you edit prices one region at a time. StoreOps reads
        every regional price via the Play Developer API, lets you reprice them
        as one CSV — by hand or with AI — and applies the whole change in one
        call, with reusable pricing history saved first.
      </p>

      <section className="mb-12 rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">Google advantage</p>
        <h2 className="text-2xl font-bold mb-3">Return to any saved storefront price grid</h2>
        <p className="text-zinc-400 leading-relaxed">
          Every apply can save all regional prices as a named restore point. Choose an older snapshot and StoreOps writes those amounts back, after first saving the grid you are leaving. For subscriptions, this restores current pricing for new purchases; Google&apos;s legacy subscriber cohorts remain governed by Play&apos;s cohort rules.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">How it works</h2>
        <ol className="space-y-4">
          {[
            {
              step: "Connect your service account",
              detail:
                "Upload the service-account JSON once. The key becomes a non-extractable browser key — it never reaches our servers.",
            },
            {
              step: "Export current prices as CSV",
              detail:
                "Every region and currency for the product you pick — in-app products and subscription base plans both supported.",
            },
            {
              step: "Reprice with AI or a spreadsheet",
              detail:
                "Pick an objective — purchasing-power parity, growth, max revenue, retention, or enterprise — and paste the prompt into any AI. Or edit the CSV yourself.",
            },
            {
              step: "Preview the diff, apply once",
              detail:
                "Every change is shown side-by-side before anything is written. One click applies all regions; named pricing snapshots let you return to an older storefront grid later.",
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
        <h2 className="text-2xl font-bold mb-4">Google Play vs App Store pricing</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          Google Play prices are free-form — any value within the currency&apos;s
          min/max — while Apple restricts you to ~800 fixed price points per
          territory. That makes Play repricing simpler: whatever your AI or
          spreadsheet suggests is applied exactly, no tier-snapping needed.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          StoreOps manages both stores with the same workflow, so you can keep
          prices consistent across platforms.{" "}
          <Link href="/cross-platform-app-pricing" className="text-emerald-400 hover:text-emerald-300">
            See cross-platform pricing →
          </Link>
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
        <p className="font-semibold text-lg mb-2">Reprice your Play app in minutes</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview. Your key stays in your browser.
        </p>
        <Link
          href="/play"
          className="inline-block rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
        >
          Connect Google Play free →
        </Link>
      </div>
    </main>
  );
}
