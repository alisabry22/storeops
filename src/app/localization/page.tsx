import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Localization Tool — Manage All 40 Languages in One View",
  description:
    "Manage App Store localizations across all 40 supported languages without clicking through App Store Connect. Bulk edit descriptions, keywords, and promotional text for every locale at once.",
  alternates: { canonical: `${SITE_URL}/localization` },
  openGraph: {
    title: "App Store Localization Tool — Manage All 40 Languages in One View",
    description:
      "Stop editing App Store localizations one language at a time. StoreOps shows all 40 locales in one table.",
    url: `${SITE_URL}/localization`,
  },
};

const LOCALES = [
  "English (US)", "English (UK)", "English (Australia)", "French", "German",
  "Spanish", "Spanish (Mexico)", "Italian", "Portuguese (Brazil)", "Portuguese (Portugal)",
  "Dutch", "Russian", "Japanese", "Korean", "Chinese (Simplified)",
  "Chinese (Traditional)", "Arabic", "Turkish", "Swedish", "Danish",
  "Norwegian", "Finnish", "Polish", "Czech", "Hungarian",
  "Romanian", "Greek", "Hebrew", "Thai", "Indonesian",
  "Malay", "Vietnamese", "Ukrainian", "Croatian", "Slovak",
  "Catalan", "Hindi", "Bengali", "Tamil", "Kazakh",
];

export default function LocalizationPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block">
        ← StoreOps
      </Link>

      <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
        App Store Localization Tool
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        App Store Connect handles one locale at a time. StoreOps loads all 40 at once so you
        can manage every language in a single screen — no tab-switching, no copy-pasting.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Why localization matters for revenue</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          Apps with localized metadata rank better in non-English App Stores. Apple&apos;s search
          algorithm uses your keywords and description for each storefront independently —
          English keywords don&apos;t help you rank in Japan or Germany.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          Most indie developers ship English-only because managing 40 locales in App Store
          Connect is too painful to be worth it. StoreOps removes that friction. With AI
          repricing for metadata, localizing your app becomes a one-afternoon job instead of
          a week-long project.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Supported App Store locales</h2>
        <p className="text-zinc-400 mb-5 text-sm">
          StoreOps loads and edits all {LOCALES.length}+ App Store localizations:
        </p>
        <div className="flex flex-wrap gap-2">
          {LOCALES.map((l) => (
            <span
              key={l}
              className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400"
            >
              {l}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">What you can edit per locale</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { field: "Description", detail: "Up to 4,000 characters. The main sales pitch for each market." },
            { field: "Keywords", detail: "Up to 100 characters. Critical for App Store search ranking per country." },
            { field: "Promotional Text", detail: "170 characters. Editable any time without a new app version." },
            { field: "What's New", detail: "Release notes per locale. Update once, apply to all languages." },
            { field: "App Name", detail: "Up to 30 characters. Can differ by locale for better local branding." },
            { field: "Subtitle", detail: "Up to 30 characters. Appears below the name in search results." },
          ].map((f) => (
            <div key={f.field} className="rounded-lg border border-zinc-800 p-4">
              <p className="font-semibold text-zinc-200 mb-1">{f.field}</p>
              <p className="text-sm text-zinc-400">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6 text-center">
        <p className="font-semibold text-lg mb-2">Manage all your locales in one place</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and view all localizations. No account required.
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
