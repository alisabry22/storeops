import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Connect CSV Import — Import Prices from a Spreadsheet",
  description:
    "Import App Store pricing from a CSV file. Paste AI-generated prices, upload a spreadsheet, or edit directly — StoreOps snaps every value to a valid Apple tier and previews the diff before applying.",
  alternates: { canonical: `${SITE_URL}/csv-import` },
  openGraph: {
    title: "App Store Connect CSV Import — Import Prices from a Spreadsheet",
    description:
      "Import App Store prices from CSV. AI-ready format, automatic price snapping, diff preview before apply.",
    url: `${SITE_URL}/csv-import`,
  },
};

export default function CsvImportPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block">
        ← StoreOps
      </Link>

      <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
        App Store Connect CSV Import
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        The fastest way to reprice your app across all 175 territories: export your current
        prices, edit in a spreadsheet or AI tool, import back. StoreOps handles the
        rest.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The CSV format</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          StoreOps accepts a simple three-column CSV. The format is intentionally loose —
          AI tools, Google Sheets, and Excel all produce compatible output:
        </p>
        <pre className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-4 text-sm font-mono text-zinc-300 overflow-x-auto">
{`territory,currency,price
USA,USD,4.99
EGY,EGP,49.99
DEU,EUR,3.99
GBR,GBP,3.99
JPN,JPY,750`}
        </pre>
        <ul className="mt-4 space-y-2 text-sm text-zinc-400">
          <li className="flex gap-2"><span className="text-emerald-400">▸</span> First column: 3-letter ISO territory code (USA, EGY, DEU, GBR…)</li>
          <li className="flex gap-2"><span className="text-emerald-400">▸</span> Header row is auto-detected and skipped</li>
          <li className="flex gap-2"><span className="text-emerald-400">▸</span> Tabs, semicolons, and commas all work as delimiters</li>
          <li className="flex gap-2"><span className="text-emerald-400">▸</span> Omit territories to keep their current price unchanged</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Automatic price snapping</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          Apple only allows specific price points per territory — you can&apos;t set an arbitrary
          number. StoreOps fetches all valid price points for every territory (up to 8,000 per
          request via Apple&apos;s bulk endpoint) and automatically snaps each requested price to
          the nearest valid tier.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          If you request $4.79 in the US and Apple&apos;s tiers only have $4.99 and $4.49,
          StoreOps picks $4.99 and flags it in the preview. You always see exactly what will
          be set before anything is sent to Apple.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The AI repricing workflow</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          StoreOps includes a built-in AI prompt you can copy and paste into ChatGPT or Claude.
          The prompt includes your current prices and asks for purchasing power parity
          adjustments — so your app is fairly priced in every market.
        </p>
        <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-5 py-4 text-sm text-zinc-400 space-y-3">
          <p><span className="text-emerald-400 font-mono">Step 1</span> — Click &ldquo;Export current CSV&rdquo; to get your 175 territories</p>
          <p><span className="text-emerald-400 font-mono">Step 2</span> — Click &ldquo;Copy AI prompt + my prices&rdquo; — it builds the full prompt automatically</p>
          <p><span className="text-emerald-400 font-mono">Step 3</span> — Paste into ChatGPT or Claude, get back a repriced CSV in seconds</p>
          <p><span className="text-emerald-400 font-mono">Step 4</span> — Paste the result back into StoreOps, review the diff, apply</p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Supported import types</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "App pricing", note: "All 175 territories, app price tiers" },
            { label: "Subscription pricing", note: "Per subscription, per territory" },
            { label: "IAP pricing", note: "Non-consumables, consumables, lifetime" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border border-zinc-800 p-4">
              <p className="font-semibold text-zinc-200 mb-1">{t.label}</p>
              <p className="text-xs text-zinc-500">{t.note}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6 text-center">
        <p className="font-semibold text-lg mb-2">Import your first price sheet in minutes</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview. No account required.
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
