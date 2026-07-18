import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Play Console Pricing Tool — Regional Prices Without the Clicking",
  description:
    "A faster way to manage Play Console pricing: set in-app product and subscription prices for every region from one strict CSV, with controlled policy previews and corrective-change snapshots.",
  alternates: { canonical: `${SITE_URL}/play-console-pricing` },
  openGraph: {
    title: "Play Console Pricing Tool — Regional Prices Without the Clicking",
    description:
      "Manage Play Console pricing for every region from one CSV — AI local pricing, diff preview, rollback.",
    url: `${SITE_URL}/play-console-pricing`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How do I set different prices per country in Play Console?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "In Play Console you edit each region's price manually in the product's pricing page. With StoreOps you export all regional prices as CSV, change them in bulk (or let AI suggest purchasing-power-adjusted prices), preview the diff, and apply every region in one operation via the Play Developer API.",
      },
    },
    {
      "@type": "Question",
      name: "Can I update Google Play subscription prices in bulk?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Subscription prices live in base plans with a regional config per country. StoreOps edits the whole regional config set in one PATCH — existing subscribers keep their price unless you run a price-change cohort in Play Console.",
      },
    },
    {
      "@type": "Question",
      name: "What permissions does the service account need?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Invite the service-account email in Play Console → Users and permissions with 'Manage store presence' and 'Manage orders' permissions (or Admin), and enable the Google Play Android Developer API in the Google Cloud project.",
      },
    },
  ],
};

export default function PlayConsolePricingPage() {
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
        Play Console Pricing, Minus the Clicking
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        Repricing an app across Google Play&apos;s regions means dozens of manual
        edits in Play Console — per product. StoreOps turns it into one
        anchored or bounded preview with automatic snapshots.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">What you can manage</h2>
        <div className="space-y-4">
          {[
            {
              type: "In-app products",
              description:
                "One-time purchases — consumables, unlocks, lifetime plans. Prices per region in micros, edited as plain decimals in your CSV. Missing regions can auto-convert from your default price.",
            },
            {
              type: "Subscription base plans",
              description:
                "Each base plan holds a regional price config per country. StoreOps updates the full set in one PATCH. New subscribers get the new price; existing ones are untouched.",
            },
            {
              type: "Controlled local pricing",
              description:
                "Five bounded policies — market access, growth, revenue, retention, and professional positioning. AI can translate your goal into policy settings, but deterministic code calculates every reviewed price.",
            },
          ].map((t) => (
            <div key={t.type} className="rounded-lg border border-zinc-800 p-5">
              <h3 className="font-semibold text-zinc-200 mb-2">{t.type}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{t.description}</p>
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
        <p className="font-semibold text-lg mb-2">Try it on your app</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview. Your service-account key never leaves the browser.
        </p>
        <Link
          href="/play"
          className="inline-block rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
        >
          Open the Play pricing tool →
        </Link>
      </div>
    </main>
  );
}
