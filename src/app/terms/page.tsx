import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for StoreOps.",
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 11, 2026";

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      <Link
        href="/"
        className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block"
      >
        ← StoreOps
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm text-zinc-500 mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:mb-2">
        <section>
          <h2>1. The service</h2>
          <p>
            StoreOps is a browser-based tool for managing App Store Connect and
            Google Play Console data — pricing, metadata, subscriptions, and
            in-app products — through the official Apple and Google APIs, using
            credentials you create and control. StoreOps is not affiliated
            with, endorsed by, or sponsored by Apple Inc. or Google LLC.
          </p>
        </section>

        <section>
          <h2>2. Your credentials, your responsibility</h2>
          <p>
            You connect StoreOps using API credentials issued by your own Apple
            or Google developer account. These credentials are stored only in
            your browser as non-extractable keys and are never transmitted to
            our servers. You are responsible for the scope and permissions of
            the keys you create, and for all changes applied to your store
            listings through the service. Every write operation shows a preview
            first and saves a snapshot for rollback — review previews before
            applying.
          </p>
        </section>

        <section>
          <h2>3. Accounts</h2>
          <p>
            A free account is required to connect a store. You are responsible
            for keeping your account access secure. We may suspend accounts
            that abuse the service, attempt to circumvent plan limits, or use
            it unlawfully.
          </p>
        </section>

        <section>
          <h2>4. Plans, billing, and refunds</h2>
          <p>
            The free plan covers browsing, previews, and exports. Paid plans
            (Pro yearly, Lifetime) unlock write operations. Payments are
            processed by Lemon Squeezy as merchant of record — they handle
            checkout, invoices, and applicable taxes. We offer a{" "}
            <strong className="text-zinc-100">14-day refund</strong>, no
            questions asked — contact support with your order email. Yearly
            subscriptions can be cancelled anytime and remain active until the
            end of the paid period.
          </p>
        </section>

        <section>
          <h2>5. No warranty</h2>
          <p>
            The service is provided &ldquo;as is.&rdquo; We work against
            Apple&apos;s and Google&apos;s official APIs, but those APIs and
            their policies can change without notice. We do not guarantee
            uninterrupted availability or that any specific store operation
            will succeed. To the maximum extent permitted by law, our total
            liability is limited to the amount you paid us in the twelve
            months before the claim.
          </p>
        </section>

        <section>
          <h2>6. Changes</h2>
          <p>
            We may update these terms; material changes will be announced on
            this page with a new date above. Continuing to use the service
            after a change means you accept the updated terms.
          </p>
        </section>

        <section>
          <h2>7. Contact</h2>
          <p>
            Questions, refunds, anything else:{" "}
            <a
              href="mailto:support@storeops.dev"
              className="text-emerald-400 hover:text-emerald-300"
            >
              support@storeops.dev
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
