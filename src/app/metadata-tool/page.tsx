import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Metadata Tool — Bulk Edit Descriptions, Keywords & What's New",
  description:
    "Edit App Store metadata across all locales at once. Bulk update descriptions, keywords, promotional text, and What's New for every language without clicking through App Store Connect.",
  alternates: { canonical: `${SITE_URL}/metadata-tool` },
  openGraph: {
    title: "App Store Metadata Tool — Bulk Edit Descriptions, Keywords & What's New",
    description:
      "Bulk update App Store descriptions, keywords, and What's New across all locales — without clicking through App Store Connect one language at a time.",
    url: `${SITE_URL}/metadata-tool`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can I edit App Store metadata for all languages at once?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. StoreOps shows all your app's locales in a single table. Edit the English description, copy it to all other locales, or write unique content per locale — without leaving a single screen.",
      },
    },
    {
      "@type": "Question",
      name: "What App Store metadata fields can I edit in bulk?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Description (4000 chars), Keywords (100 chars), Promotional Text (170 chars), What's New (4000 chars), App Name (30 chars), and Subtitle (30 chars). All fields, all locales, one interface.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to submit a new version to update metadata?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It depends on the field. Promotional Text can be updated at any time without a new version. Description, Keywords, and What's New require an app version in Prepare for Submission state.",
      },
    },
  ],
};

const FIELDS = [
  { name: "Description", limit: "4,000 chars", note: "Requires version in review" },
  { name: "Keywords", limit: "100 chars", note: "Requires version in review" },
  { name: "Promotional Text", limit: "170 chars", note: "Live-editable any time" },
  { name: "What's New", limit: "4,000 chars", note: "Requires version in review" },
  { name: "App Name", limit: "30 chars", note: "Editable pre-submission" },
  { name: "Subtitle", limit: "30 chars", note: "Editable pre-submission" },
];

export default function MetadataToolPage() {
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
        App Store Metadata Tool
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        App Store Connect shows one locale at a time. StoreOps shows all of them at once —
        so updating What&apos;s New across 40 languages takes one minute, not one hour.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">The metadata problem</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          If your app supports 10 languages, updating your release notes means opening 10 locale
          tabs in App Store Connect, typing or pasting the same text 10 times, and saving 10
          times. At 40 locales it becomes a release ritual that takes most of an afternoon.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          The App Store Connect API exposes all of this programmatically. StoreOps wraps it in
          a usable interface — a spreadsheet-like table where you can edit all locales side by
          side and apply everything at once.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Supported metadata fields</h2>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Limit</th>
                <th className="px-4 py-3 font-medium">When editable</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f, i) => (
                <tr key={f.name} className={i > 0 ? "border-t border-zinc-800/60" : ""}>
                  <td className="px-4 py-3 font-medium text-zinc-200">{f.name}</td>
                  <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{f.limit}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">How bulk metadata editing works</h2>
        <div className="space-y-5">
          {[
            {
              title: "Load all your locales",
              body: "StoreOps fetches every localization for your current app version — all 40 App Store languages in one view.",
            },
            {
              title: "Edit in a single table",
              body: 'Select a field, edit for one locale, and optionally apply the value to all others. Perfect for "What\'s New" where the text is the same across languages before translation.',
            },
            {
              title: "Character count enforcement",
              body: "Every field enforces Apple's character limits in real time. You can't accidentally submit a 4,001-character description.",
            },
            {
              title: "Apply to Apple",
              body: "One click writes all changed locales via the App Store Connect API. Only fields you actually edited are touched — the rest are left exactly as they are.",
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
        <p className="font-semibold text-lg mb-2">Update all locales in minutes</p>
        <p className="text-sm text-zinc-400 mb-5">
          Free to connect and preview all metadata. No account required.
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
