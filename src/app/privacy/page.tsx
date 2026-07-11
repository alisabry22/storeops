import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What StoreOps collects, what it never collects, and where your data lives.",
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "July 11, 2026";

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-14">
      <Link
        href="/"
        className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block"
      >
        ← StoreOps
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm text-zinc-500 mb-10">Last updated: {LAST_UPDATED}</p>

      <div className="space-y-8 text-sm text-zinc-300 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5">
        <section>
          <h2>The short version</h2>
          <p>
            Your store credentials never reach us — they are imported as
            non-extractable keys that exist only in your browser. What we do
            store: your email, your plan, and the pricing snapshots you save.
            We don&apos;t sell data, run ads, or use third-party ad trackers.
          </p>
        </section>

        <section>
          <h2>What we never collect</h2>
          <ul>
            <li>
              Your App Store Connect .p8 private key or Google service-account
              key — both are imported as{" "}
              <strong className="text-zinc-100">
                non-extractable WebCrypto keys
              </strong>{" "}
              in your browser&apos;s local storage (IndexedDB). They sign
              short-lived API tokens locally and physically cannot be read
              back or exported — by our code, your browser extensions, or
              anyone else.
            </li>
            <li>
              Your store data — app listings, prices, and metadata flow
              directly between your browser and Apple/Google. Our API proxy
              forwards requests (it exists only because Apple and Google block
              browser CORS) and stores nothing.
            </li>
            <li>Payment card details — checkout is handled entirely by Lemon Squeezy.</li>
          </ul>
        </section>

        <section>
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong className="text-zinc-100">Account:</strong> your email
              address and a user id, managed by Clerk (our authentication
              provider).
            </li>
            <li>
              <strong className="text-zinc-100">Plan:</strong> whether your
              account is free, Pro, or Lifetime, sourced from Lemon Squeezy
              purchase events matched by email.
            </li>
            <li>
              <strong className="text-zinc-100">Snapshots:</strong> pricing
              snapshots you save are synced to your account so they follow you
              across devices. They contain price rows — no credentials.
            </li>
            <li>
              <strong className="text-zinc-100">Usage:</strong> anonymous
              page analytics and coarse product events (e.g. &ldquo;a license
              was claimed&rdquo;) to understand what&apos;s working. No
              session recording, no fingerprinting.
            </li>
          </ul>
        </section>

        <section>
          <h2>Who processes data for us</h2>
          <ul>
            <li>Clerk — authentication (email, sign-in)</li>
            <li>Lemon Squeezy — payments, invoices, tax (merchant of record)</li>
            <li>Neon — database hosting (plan, snapshots)</li>
            <li>Vercel — application hosting and anonymous analytics</li>
          </ul>
        </section>

        <section>
          <h2>Email</h2>
          <p>
            We may send transactional email (receipts come from Lemon
            Squeezy) and occasional product updates to account holders. Every
            marketing email includes one-click unsubscribe.
          </p>
        </section>

        <section>
          <h2>Your data, your call</h2>
          <p>
            Want your account and everything attached to it deleted? One
            email:{" "}
            <a
              href="mailto:support@storeops.dev"
              className="text-emerald-400 hover:text-emerald-300"
            >
              support@storeops.dev
            </a>
            . Disconnecting a store in the app deletes the local signing key
            from your browser immediately.
          </p>
        </section>
      </div>
    </main>
  );
}
