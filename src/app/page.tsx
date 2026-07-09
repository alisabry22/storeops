"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch } from "@/lib/asc/client";
import { destroyPrivateKey, storePrivateKey } from "@/lib/asc/jwt";
import { CHECKOUT_URL } from "@/lib/license";

const FEATURES = [
  {
    emoji: "📝",
    title: "Bulk metadata",
    body: "Description, keywords, promo text, What's New — edited across every locale in one table. “Apply to all” and go.",
    saves: "~1h per release",
  },
  {
    emoji: "🤖",
    title: "AI repricing loop",
    body: "Export your prices as CSV, let ChatGPT or Claude reprice for purchasing power, paste back. We snap every price to a real Apple tier.",
    saves: "~1 afternoon",
  },
  {
    emoji: "💳",
    title: "Subscription pricing",
    body: "Reprice subscriptions across 175 territories with existing subscribers protected by default. The scariest job in ASC, made boring.",
    saves: "~2h per tier",
  },
  {
    emoji: "⏪",
    title: "Snapshots & rollback",
    body: "Every apply saves a snapshot first, automatically. Botched an import? One click puts every price back exactly as it was.",
    saves: "your sanity",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Connect your key",
    body: "Your .p8 becomes a non-extractable browser key. It physically cannot be read back — not even by our code.",
  },
  {
    n: "2",
    title: "Preview everything",
    body: "Every change is a dry run first. See the exact diff — current vs. new — before anything touches Apple.",
  },
  {
    n: "3",
    title: "Apply once",
    body: "One click writes all locales and territories. A snapshot is saved automatically so you can always roll back.",
  },
];

export default function SetupPage() {
  const router = useRouter();
  const { credentials, setCredentials } = useCredentials();
  const [issuerId, setIssuerId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "error">("idle");
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && credentials) router.replace("/apps");
  }, [hydrated, credentials, router]);

  async function handleKeyFile(file: File) {
    setPrivateKeyPem(await file.text());
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setStatus("testing");
    setError("");
    const creds = {
      issuerId: issuerId.trim(),
      keyId: keyId.trim(),
    };
    try {
      // Import the .p8 as a NON-EXTRACTABLE key (IndexedDB). The PEM itself
      // is never persisted anywhere — after this line it only exists in the
      // form state, which is discarded on navigation.
      await storePrivateKey(privateKeyPem);
      // Validate the credentials with a real API call before saving
      await ascFetch(creds, "/v1/apps", { params: { limit: "1" } });
      setCredentials(creds);
      router.push("/apps");
    } catch (err) {
      // Bad key or bad IDs — don't leave a dangling signing key behind
      await destroyPrivateKey();
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not connect to Apple."
      );
    }
  }

  if (!hydrated) return null;

  return (
    <main className="w-full">
      {/* ---------- Hero + connect ---------- */}
      <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 grid gap-12 lg:grid-cols-[1.1fr_1fr] items-start">
        <div className="animate-fade-up">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-900/70 bg-emerald-950/40 px-3 py-1 text-xs text-emerald-400 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Built by an indie dev, for indie devs
          </p>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Stop clicking through
            <br />
            <span className="text-emerald-400">App Store Connect.</span>
          </h1>

          <p className="mt-5 text-lg text-zinc-400 leading-relaxed">
            Bulk metadata, worldwide pricing, and subscription repricing for
            all <span className="text-zinc-200 font-semibold">175 storefronts</span>{" "}
            — with a dry-run preview and one-click rollback.
          </p>

          <ul className="mt-8 space-y-3 text-[15px] text-zinc-300">
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                &ldquo;What&apos;s New&rdquo; in 40 locales —{" "}
                <span className="text-zinc-500 line-through">1 hour</span>{" "}
                <span className="text-emerald-400 font-semibold">1 click</span>
              </span>
            </li>
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                Reprice every storefront for local purchasing power —{" "}
                <span className="text-zinc-500 line-through">an afternoon</span>{" "}
                <span className="text-emerald-400 font-semibold">2 minutes</span>
              </span>
            </li>
            <li className="flex gap-3 items-baseline">
              <span className="text-emerald-400 font-mono text-sm">▸</span>
              <span>
                Change subscription prices{" "}
                <span className="text-zinc-200 font-medium">
                  without touching existing subscribers
                </span>
              </span>
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-2">
            {["175 storefronts", "40+ locales", "0 accounts", "100% key-private"].map(
              (chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs text-zinc-400 font-mono"
                >
                  {chip}
                </span>
              )
            )}
          </div>
        </div>

        {/* Connect card */}
        <div className="card card-hero p-6 animate-fade-up lg:sticky lg:top-8">
          <h2 className="font-semibold text-lg mb-1">Connect &amp; try it free</h2>
          <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
            Your .p8 becomes a{" "}
            <strong className="text-zinc-200">non-extractable browser key</strong>{" "}
            — it signs 20-minute tokens locally and can never be read back, not
            even by our own code. It never touches our servers.
          </p>

          <form onSubmit={connect} className="space-y-4">
            <label className="block">
              <span className="text-sm text-zinc-300">Issuer ID</span>
              <input
                value={issuerId}
                onChange={(e) => setIssuerId(e.target.value)}
                placeholder="69a6de70-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                required
                className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none placeholder:text-zinc-600"
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Key ID</span>
              <input
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="2X9R4HXF34"
                required
                className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none placeholder:text-zinc-600"
              />
            </label>

            <label className="block">
              <span className="text-sm text-zinc-300">Private key (.p8 file)</span>
              <input
                type="file"
                accept=".p8,.pem"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleKeyFile(f);
                }}
                className="mt-1 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700 file:cursor-pointer"
              />
              {privateKeyPem && (
                <span className="mt-1 block text-xs text-emerald-400">
                  Key loaded ✓
                </span>
              )}
            </label>

            <button
              type="submit"
              disabled={!privateKeyPem || status === "testing"}
              className="btn-glow w-full rounded-md bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none transition"
            >
              {status === "testing" ? "Verifying with Apple…" : "Connect — free"}
            </button>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </form>

          <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
            App Store Connect → Users and Access → Integrations → App Store
            Connect API. Role: <strong className="text-zinc-400">App Manager</strong> is
            enough.
          </p>
        </div>
      </section>

      {/* ---------- Stats strip ---------- */}
      <section className="max-w-5xl mx-auto px-6 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { n: "175", l: "storefronts" },
            { n: "40+", l: "locales" },
            { n: "20 min", l: "per token" },
            { n: "0", l: "servers store your key" },
          ].map((s) => (
            <div key={s.l} className="card p-4 animate-fade-up">
              <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums">{s.n}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-8">
          Three steps. No account.
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-900 text-emerald-400 font-mono text-sm mb-3">
                {s.n}
              </span>
              <h3 className="font-semibold mb-1.5">{s.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-2">
          Everything ASC makes painful
        </h2>
        <p className="text-zinc-400 mb-8">
          Time saved is money in your pocket. That&apos;s the whole product.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 group hover:border-emerald-800/60 transition">
              <div className="flex items-start justify-between mb-2">
                <span className="text-2xl">{f.emoji}</span>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-900/60 rounded-full px-2.5 py-0.5">
                  saves {f.saves}
                </span>
              </div>
              <h3 className="font-semibold mb-1.5">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Security ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="card card-hero p-7">
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            🔐 Your key can&apos;t leak. The browser won&apos;t allow it.
          </h2>
          <p className="text-zinc-400 mb-6 max-w-2xl leading-relaxed">
            An App Store Connect key can rewrite your whole business — so we
            designed StoreOps around never having it.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Non-extractable key</p>
              <p className="text-zinc-400 leading-relaxed">
                Your .p8 is imported as a WebCrypto key that can sign but never
                be exported. XSS, extensions, even our own code — nothing can
                read it back.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">20-minute tokens</p>
              <p className="text-zinc-400 leading-relaxed">
                Only short-lived signed tokens ever cross the wire, over TLS.
                The proxy exists solely because Apple blocks browser CORS.
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-200 mb-1">Nothing stored</p>
              <p className="text-zinc-400 leading-relaxed">
                No accounts, no database, no logs of your data. The code is
                public — audit the whole path yourself.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold tracking-tight mb-8 text-center">
          Simple pricing. No account, just a license key.
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
          <div className="card p-6">
            <p className="font-semibold text-lg mb-1">Free</p>
            <p className="text-3xl font-bold mb-4">
              $0
              <span className="text-sm font-normal text-zinc-500"> forever</span>
            </p>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li>✓ Connect &amp; browse everything</li>
              <li>✓ Preview every change (dry run)</li>
              <li>✓ Export prices &amp; AI prompts</li>
              <li className="text-zinc-500">✗ Applying changes to Apple</li>
            </ul>
          </div>
          <div className="card card-hero p-6 relative">
            <span className="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold text-zinc-950">
              For shipping devs
            </span>
            <p className="font-semibold text-lg mb-1 text-emerald-400">Pro</p>
            <p className="text-3xl font-bold mb-4">
              $49.99
              <span className="text-sm font-normal text-zinc-500"> /year</span>
            </p>
            <ul className="space-y-2 text-sm text-zinc-300">
              <li>✓ Every apply — metadata, prices, subscriptions</li>
              <li>✓ Snapshots &amp; one-click rollback</li>
              <li>✓ Subscriber-safe subscription repricing</li>
              <li>✓ All 175 storefronts, all your apps</li>
            </ul>
            <a
              href={CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glow mt-5 block w-full text-center rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
            >
              Get Pro
            </a>
            <p className="mt-3 text-center text-xs text-zinc-400">
              <span className="text-emerald-400">14-day refund</span> · cancel anytime · one key, all your devices
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          One botched manual price update costs more than a year of StoreOps.
        </p>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="max-w-5xl mx-auto px-6 py-10 border-t border-zinc-900 mt-8">
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-6">
          {[
            { href: "/bulk-pricing", label: "Bulk App Pricing" },
            { href: "/subscription-pricing", label: "Subscription Pricing" },
            { href: "/metadata-tool", label: "Metadata Tool" },
            { href: "/localization", label: "App Store Localization" },
            { href: "/asc-api", label: "ASC API" },
            { href: "/asc-automation", label: "ASC Automation" },
            { href: "/csv-import", label: "CSV Import" },
            { href: "/app-store-connect-pricing", label: "ASC Pricing" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              {l.label}
            </a>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-500">
          Built by an indie dev who got tired of clicking. 🛠 — Store
          <span className="text-emerald-500">Ops</span>
        </p>
      </footer>
    </main>
  );
}
