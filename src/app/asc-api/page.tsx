import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Connect API Tool — Use the ASC API Without Writing Code",
  description:
    "StoreOps is a no-code App Store Connect API client for indie developers. Manage metadata, pricing, subscriptions, and IAPs via the ASC API — no scripts, no CI, no setup.",
  alternates: { canonical: `${SITE_URL}/asc-api` },
  openGraph: {
    title: "App Store Connect API Tool — Use the ASC API Without Writing Code",
    description:
      "Use the App Store Connect API to manage your apps without writing code. StoreOps is a browser-based ASC API client for indie developers.",
    url: `${SITE_URL}/asc-api`,
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the App Store Connect API?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The App Store Connect API is Apple's REST API for automating app management tasks. It covers metadata, pricing, subscriptions, in-app purchases, TestFlight, and more. It requires a private key (.p8) from App Store Connect → Users and Access → Integrations.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to write code to use the App Store Connect API?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not with StoreOps. StoreOps is a browser-based interface that talks to the ASC API on your behalf. You provide your credentials once and get a full UI for pricing, metadata, subscriptions, and IAPs — no scripts or setup required.",
      },
    },
    {
      "@type": "Question",
      name: "Is the App Store Connect API free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The ASC API itself is free for any Apple Developer Program member. StoreOps is free to connect and preview; applying changes requires a Pro license.",
      },
    },
  ],
};

const API_AREAS = [
  {
    endpoint: "Apps & Versions",
    description: "Read app info, manage version state, edit version localizations and app info.",
  },
  {
    endpoint: "App Pricing",
    description: "Set and update app prices across all 175 territories with the price schedule API.",
  },
  {
    endpoint: "Subscriptions",
    description: "Manage subscription groups, products, and per-territory pricing via subscriptionPrices.",
  },
  {
    endpoint: "In-App Purchases",
    description: "List IAPs, read and set price schedules for consumables, non-consumables, and lifetime purchases.",
  },
  {
    endpoint: "Territories",
    description: "Fetch all 175 App Store storefronts with their currencies for pricing and reporting.",
  },
];

export default function AscApiPage() {
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
        App Store Connect API Tool
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        The App Store Connect API lets you automate everything you do in App Store Connect.
        StoreOps wraps it in a browser interface so you get the power of the API without
        writing a single line of code.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">What the ASC API can do</h2>
        <p className="text-zinc-400 leading-relaxed mb-6">
          Apple&apos;s App Store Connect API covers every major management task — metadata, pricing,
          subscriptions, TestFlight, and more. It uses JWT authentication with a private key
          (.p8) from your App Store Connect account. Every request is rate-limited to roughly
          3,500 per hour, which StoreOps handles automatically with queuing and retry.
        </p>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">API area</th>
                <th className="px-4 py-3 font-medium">What StoreOps uses it for</th>
              </tr>
            </thead>
            <tbody>
              {API_AREAS.map((a, i) => (
                <tr key={a.endpoint} className={i > 0 ? "border-t border-zinc-800/60" : ""}>
                  <td className="px-4 py-3 font-medium text-zinc-200 whitespace-nowrap">{a.endpoint}</td>
                  <td className="px-4 py-3 text-zinc-400">{a.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Security: how StoreOps handles your key</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          The ASC API requires a private key (.p8 file) that has full access to your App Store
          Connect account. Sharing or leaking this key is catastrophic. StoreOps was designed
          from the ground up to never store it:
        </p>
        <ul className="space-y-3 text-sm text-zinc-400">
          <li className="flex gap-3">
            <span className="text-emerald-400 mt-0.5">▸</span>
            <span>Your .p8 is imported as a <strong className="text-zinc-200">non-extractable WebCrypto key</strong> stored only in your browser&apos;s IndexedDB. It can sign tokens but cannot be read back.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400 mt-0.5">▸</span>
            <span>Signing happens <strong className="text-zinc-200">locally in your browser</strong>. Only short-lived JWT tokens (20-minute expiry) are sent to StoreOps&apos;s proxy server.</span>
          </li>
          <li className="flex gap-3">
            <span className="text-emerald-400 mt-0.5">▸</span>
            <span>The proxy exists only because <strong className="text-zinc-200">Apple blocks CORS from browsers</strong>. It forwards requests and never stores credentials or responses.</span>
          </li>
        </ul>
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
        <p className="font-semibold text-lg mb-2">Use the ASC API without writing code</p>
        <p className="text-sm text-zinc-400 mb-5">
          Connect your key and start managing your apps in minutes. Free to try.
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
