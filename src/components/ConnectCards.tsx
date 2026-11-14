"use client";

import { useState } from "react";
import { useCredentials } from "@/lib/store";
import { ascFetch } from "@/lib/asc/client";
import { destroyPrivateKey, importPrivateKey, storePrivateKey } from "@/lib/asc/jwt";
import { storeServiceAccount } from "@/lib/gp/auth";
import { useGpStore } from "@/lib/gp/store";
import { KeyFilePicker } from "./KeyFilePicker";

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none";

/** Apple names downloaded keys AuthKey_<KEY ID>.p8 — use it to skip a field. */
function keyIdFromFileName(name: string): string | null {
  const match = /AuthKey_([A-Z0-9]{8,12})\.p8$/i.exec(name);
  return match ? match[1].toUpperCase() : null;
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
      {children}
    </p>
  );
}

export function ReconnectNote({ store }: { store: "apple" | "google" }) {
  return (
    <div className="mb-5 rounded-lg border border-amber-800/70 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
      <strong className="font-semibold">Add your key again to continue.</strong>{" "}
      <span className="text-amber-200/80">
        {store === "apple"
          ? "Your App Store IDs are saved, but the .p8 key isn't in this browser. Keys never leave the device they were added on."
          : "Your Google Play apps are saved, but the service-account key isn't in this browser. Keys never leave the device they were added on."}
      </span>
    </div>
  );
}

export function AppleConnectCard({
  reconnect = false,
  onConnected,
}: {
  reconnect?: boolean;
  onConnected: () => void;
}) {
  const { credentials, setCredentials } = useCredentials();
  const [issuerId, setIssuerId] = useState(credentials?.issuerId ?? "");
  const [keyId, setKeyId] = useState(credentials?.keyId ?? "");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "testing">("idle");
  const [error, setError] = useState("");

  async function acceptKeyText(text: string, name: string) {
    setError("");
    try {
      // Validate early so a wrong file fails here, not after "Connect".
      await importPrivateKey(text);
      setPrivateKeyPem(text);
      setFileName(name);
      const fromName = keyIdFromFileName(name);
      if (fromName && !keyId.trim()) setKeyId(fromName);
    } catch {
      setPrivateKeyPem("");
      setFileName("");
      setError("That file isn't an App Store Connect private key. Choose the AuthKey_….p8 file you downloaded from Apple.");
    }
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setStatus("testing");
    setError("");
    const creds = { issuerId: issuerId.trim(), keyId: keyId.trim() };
    try {
      // Import the .p8 as a NON-EXTRACTABLE key (IndexedDB). The PEM itself
      // is never persisted anywhere.
      await storePrivateKey(privateKeyPem);
      // Validate the credentials with a real API call before saving.
      await ascFetch(creds, "/v1/apps", { params: { limit: "1" } });
      setCredentials(creds);
      onConnected();
    } catch (err) {
      // Bad key or bad IDs — don't leave a dangling signing key behind.
      await destroyPrivateKey();
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not connect to Apple.");
    }
  }

  const ready = !!privateKeyPem && !!issuerId.trim() && !!keyId.trim();

  return (
    <section aria-labelledby="connect-apple" className="card flex flex-col p-6">
      <header className="mb-5">
        <p className="text-xs font-medium text-zinc-500">iPhone, iPad &amp; Mac</p>
        <h2 id="connect-apple" className="mt-1 text-xl font-semibold text-zinc-50">App Store Connect</h2>
      </header>
      {reconnect && <ReconnectNote store="apple" />}

      <form onSubmit={connect} className="flex flex-1 flex-col gap-4">
        <KeyFilePicker
          label="Private key (.p8)"
          hint="AuthKey_XXXXXXXXXX.p8 from App Store Connect"
          fileName={fileName}
          loaded={!!privateKeyPem}
          disabled={status === "testing"}
          onFile={(file) => void file.text().then((text) => acceptKeyText(text, file.name))}
        />
        <details className="-mt-2 text-xs text-zinc-400">
          <summary className="inline-flex min-h-8 cursor-pointer items-center hover:text-zinc-200">Paste the key text instead</summary>
          <textarea
            rows={4}
            spellCheck={false}
            autoComplete="off"
            placeholder="-----BEGIN PRIVATE KEY-----"
            className={`${inputClass} text-xs`}
            onChange={(e) => {
              const text = e.target.value.trim();
              if (text.includes("-----END")) void acceptKeyText(text, "Pasted key");
            }}
            onBlur={(e) => {
              const text = e.target.value.trim();
              if (text && !privateKeyPem) void acceptKeyText(text, "Pasted key");
            }}
          />
        </details>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Key ID</span>
            <input
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder="2X9R4HXF34"
              autoComplete="off"
              spellCheck={false}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-zinc-200">Issuer ID</span>
            <input
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              placeholder="69a6de70-xxxx-…"
              autoComplete="off"
              spellCheck={false}
              required
              className={inputClass}
            />
          </label>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="mt-auto space-y-3 pt-2">
          <button
            type="submit"
            disabled={!ready || status === "testing"}
            className="btn-glow min-h-11 w-full rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {status === "testing" ? "Checking with Apple…" : reconnect ? "Reconnect App Store" : "Connect App Store"}
          </button>
          <details className="text-sm text-zinc-400">
            <summary className="inline-flex min-h-8 cursor-pointer items-center hover:text-zinc-200">Where do I find these?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
              <li>
                Open{" "}
                <a
                  href="https://appstoreconnect.apple.com/access/integrations/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300"
                >
                  App Store Connect → Integrations
                </a>
                .
              </li>
              <li>Generate a key with the <strong className="text-zinc-200">App Manager</strong> role and download the .p8 (Apple only lets you download it once).</li>
              <li>The Issuer ID is shown above the key list; the Key ID is in the key’s row.</li>
            </ol>
          </details>
        </div>
      </form>
    </section>
  );
}

export function GoogleConnectCard({
  reconnect = false,
  title = "Google Play",
  onConnected,
}: {
  reconnect?: boolean;
  title?: string;
  onConnected: () => void;
}) {
  const setGpCredentials = useGpStore((s) => s.setGpCredentials);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  async function connect(file: File) {
    setConnecting(true);
    setError("");
    try {
      const creds = await storeServiceAccount(await file.text());
      setGpCredentials(creds);
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <section aria-labelledby="connect-google" className="card flex flex-col p-6">
      <header className="mb-5">
        <p className="text-xs font-medium text-zinc-500">Android</p>
        <h2 id="connect-google" className="mt-1 text-xl font-semibold text-zinc-50">{title}</h2>
      </header>
      {reconnect && <ReconnectNote store="google" />}

      <div className="flex flex-1 flex-col gap-4">
        <KeyFilePicker
          label="Service-account key (.json)"
          hint={connecting ? "Importing key…" : "Choosing the file connects right away"}
          accept=".json,application/json"
          disabled={connecting}
          onFile={(file) => void connect(file)}
        />
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-sm text-zinc-400">
          After connecting you add your app’s package name once, for example <span className="font-mono text-zinc-300">com.company.app</span>.
        </p>
        <details className="mt-auto pt-2 text-sm text-zinc-400">
          <summary className="inline-flex min-h-8 cursor-pointer items-center hover:text-zinc-200">How do I create a Google key?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
            <li>Google Cloud Console → pick a project → enable the <strong className="text-zinc-200">Google Play Android Developer API</strong>.</li>
            <li>IAM → Service Accounts → create one → Keys → Add key → JSON.</li>
            <li>Play Console → Users and permissions → invite the service-account email with <strong className="text-zinc-200">Manage store presence</strong> and <strong className="text-zinc-200">Manage orders</strong> (or Admin).</li>
          </ol>
        </details>
      </div>
    </section>
  );
}
