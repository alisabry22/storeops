"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch } from "@/lib/asc/client";
import { destroyPrivateKey, storePrivateKey } from "@/lib/asc/jwt";
import { RequireAccount } from "@/components/RequireAccount";

/**
 * Store connection hub — the .p8 form lived on the landing page before the
 * SaaS split; now the homepage sells and this page connects.
 */
export default function ConnectPage() {
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
    <RequireAccount>
    <main className="max-w-2xl mx-auto px-6 py-14">
      <Link
        href="/"
        className="text-sm text-emerald-400 hover:text-emerald-300 mb-8 inline-block"
      >
        ← StoreOps
      </Link>

      <h1 className="text-3xl font-bold tracking-tight mb-2">
        Connect a store
      </h1>
      <p className="text-zinc-400 mb-10">
        Free to connect, browse, and preview everything. Your keys become
        non-extractable browser keys — they never touch our servers.
      </p>

      {/* ---------- App Store Connect ---------- */}
      <div className="card card-hero p-6 mb-6">
        <h2 className="font-semibold text-lg mb-1"> App Store Connect</h2>
        <p className="text-sm text-zinc-400 mb-5 leading-relaxed">
          Your .p8 becomes a{" "}
          <strong className="text-zinc-200">non-extractable browser key</strong>{" "}
          — it signs 20-minute tokens locally and can never be read back, not
          even by our own code.
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
            {status === "testing" ? "Verifying with Apple…" : "Connect App Store"}
          </button>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </form>

        <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
          App Store Connect → Users and Access → Integrations → App Store
          Connect API. Role:{" "}
          <strong className="text-zinc-400">App Manager</strong> is enough.
        </p>
      </div>

      {/* ---------- Google Play ---------- */}
      <div className="card p-6">
        <h2 className="font-semibold text-lg mb-1">🤖 Google Play</h2>
        <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
          Connect with a service-account JSON — same privacy model, the key
          stays in your browser. Manage in-app product and subscription prices
          across every Play region.
        </p>
        <Link
          href="/play"
          className="block w-full text-center rounded-md border border-emerald-800 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:border-emerald-500 transition"
        >
          Connect Google Play →
        </Link>
      </div>
    </main>
    </RequireAccount>
  );
}
