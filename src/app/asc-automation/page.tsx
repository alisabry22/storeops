import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "ASC Automation — Automate App Store Connect Without fastlane or CI",
  description:
    "Automate App Store Connect tasks without fastlane, shell scripts, or CI pipelines. StoreOps gives indie developers browser-based ASC automation for pricing, metadata, and subscriptions.",
  alternates: { canonical: `${SITE_URL}/asc-automation` },
  openGraph: {
    title: "ASC Automation — Automate App Store Connect Without fastlane or CI",
    description:
      "Automate App Store Connect without fastlane or CI pipelines. Browser-based ASC automation for pricing, metadata, and subscriptions.",
    url: `${SITE_URL}/asc-automation`,
  },
};

export default function AscAutomationPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16">
      <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block">
        ← StoreOps
      </Link>

      <h1 className="text-4xl font-bold tracking-tight leading-tight mb-4">
        ASC Automation
      </h1>
      <p className="text-lg text-zinc-400 leading-relaxed mb-10">
        App Store Connect automation usually means fastlane, CI pipelines, and Ruby scripts.
        StoreOps is ASC automation for everyone else — open a browser, connect your key,
        and automate pricing and metadata in minutes.
      </p>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">fastlane vs StoreOps</h2>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">fastlane</th>
                <th className="px-4 py-3 font-medium">StoreOps</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Setup time", "Hours (Ruby, Gemfile, CI config)", "30 seconds (paste credentials)"],
                ["Bulk pricing", "Custom script required", "Built-in with controlled policy previews"],
                ["Preview changes", "No dry-run for pricing", "Always shows diff first"],
                ["Rollback", "Manual", "One-click snapshot restore"],
                ["Maintenance", "Keep Ruby and gems updated", "None — browser app"],
                ["Works on Windows", "Painful", "Yes — any browser"],
              ].map(([task, fl, so], i) => (
                <tr key={task} className={i > 0 ? "border-t border-zinc-800/60" : ""}>
                  <td className="px-4 py-3 font-medium text-zinc-200">{task}</td>
                  <td className="px-4 py-3 text-zinc-500">{fl}</td>
                  <td className="px-4 py-3 text-emerald-400">{so}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-zinc-500">
          fastlane is the right tool for CI/CD builds and upload automation. StoreOps is for
          the business tasks — pricing, metadata, and subscriptions — that fastlane requires
          custom scripting for.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">What StoreOps automates</h2>
        <div className="space-y-4">
          {[
            {
              title: "Pricing across 175 territories",
              body: "Build a bounded regional policy from current prices, review official Apple tiers, then apply the accepted storefront schedules with rate-limit handling.",
            },
            {
              title: "Subscription repricing",
              body: "Change subscription prices across all territories with existing subscribers automatically protected. Handles Apple's scheduling rules so you don't have to.",
            },
            {
              title: "Metadata across all locales",
              body: "Update descriptions, keywords, promotional text, and What's New across every language without tab-switching. One apply writes all locales.",
            },
            {
              title: "In-App Purchase pricing",
              body: "Set IAP prices across every selected territory through the supported App Store Connect pricing endpoints, with progress and explicit failures.",
            },
            {
              title: "Snapshots and rollback",
              body: "Every pricing change is snapshotted before it's applied. One click rolls back every territory to exactly where it was.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-zinc-800 p-4">
              <h3 className="font-semibold text-zinc-200 mb-1">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-4">No infrastructure required</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          fastlane and custom ASC API scripts require a machine to run on — your laptop, a
          CI server, or a cron job. They require maintaining credentials in environment
          variables, keeping dependencies up to date, and debugging when Apple changes an
          endpoint.
        </p>
        <p className="text-zinc-400 leading-relaxed">
          StoreOps runs entirely in your browser. Your credentials are stored as a
          non-extractable browser key — they never leave your machine. There&apos;s nothing to
          install, maintain, or secure beyond the browser you already use.
        </p>
      </section>

      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-6 text-center">
        <p className="font-semibold text-lg mb-2">ASC automation without the setup</p>
        <p className="text-sm text-zinc-400 mb-5">
          Connect your App Store Connect key and start automating in 30 seconds. Free to try.
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
