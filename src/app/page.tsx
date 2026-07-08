"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch } from "@/lib/asc/client";

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
      privateKeyPem,
    };
    try {
      // Validate the credentials with a real API call before saving
      await ascFetch(creds, "/v1/apps", { params: { limit: "1" } });
      setCredentials(creds);
      router.push("/apps");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Could not connect to Apple."
      );
    }
  }

  if (!hydrated) return null;

  return (
    <main className="max-w-lg mx-auto w-full px-6 py-16">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          Store<span className="text-emerald-400">Ops</span>
        </h1>
        <p className="mt-2 text-zinc-400">
          App Store Connect, without the clicking. Your time goes back in your
          pocket.
        </p>
        <ul className="mt-5 space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2">
            <span className="text-emerald-400">▸</span>
            Update &ldquo;What&apos;s New&rdquo; in 40 locales —{" "}
            <span className="text-zinc-500 line-through">1 hour</span>{" "}
            <span className="text-emerald-400 font-semibold">1 click</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400">▸</span>
            Reprice 175 storefronts, override just the ones you want —{" "}
            <span className="text-zinc-500 line-through">an afternoon</span>{" "}
            <span className="text-emerald-400 font-semibold">2 minutes</span>
          </li>
          <li className="flex gap-2">
            <span className="text-emerald-400">▸</span>
            Preview every change before it touches Apple. Dry run by default.
          </li>
        </ul>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="font-semibold mb-1">Connect App Store Connect</h2>
        <p className="text-sm text-zinc-400 mb-5">
          Your key is stored{" "}
          <strong className="text-zinc-200">only in this browser</strong> and
          used to sign 20-minute tokens locally. It never touches our servers.
        </p>

        <form onSubmit={connect} className="space-y-4">
          <label className="block">
            <span className="text-sm text-zinc-300">Issuer ID</span>
            <input
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              placeholder="69a6de70-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              required
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">Key ID</span>
            <input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="2X9R4HXF34"
              required
              className="mt-1 w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm text-zinc-300">
              Private key (.p8 file)
            </span>
            <input
              type="file"
              accept=".p8,.pem"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleKeyFile(f);
              }}
              className="mt-1 block w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700"
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
            className="w-full rounded-md bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {status === "testing" ? "Verifying with Apple…" : "Connect"}
          </button>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </form>
      </div>

      <p className="mt-6 text-xs text-zinc-500 leading-relaxed">
        Create a key in App Store Connect → Users and Access → Integrations →
        App Store Connect API. Role: <strong>App Manager</strong> is enough.
      </p>

      <p className="mt-10 text-center text-xs text-zinc-600">
        Built by an indie dev who got tired of clicking. 🛠
      </p>
    </main>
  );
}
