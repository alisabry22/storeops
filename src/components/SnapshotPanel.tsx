"use client";

import { useEffect, useId, useState } from "react";
import {
  deleteSnapshot,
  exportSnapshot,
  formatSnapshotDate,
  importSnapshot,
  listSnapshots,
  MAX_SNAPSHOTS_PER_SCOPE,
  type PriceSnapshot,
} from "@/lib/snapshots";
import { fetchServerSnapshots } from "@/lib/snapshot-sync";
import { isCommunityEdition } from "@/lib/edition";

/**
 * Snapshots list with one-click restore, export, and named save.
 * refreshKey: bump after every apply so the list re-reads localStorage.
 * onSave: optional — when provided shows a named save input at the top.
 */
export function SnapshotPanel({
  appId,
  scope,
  refreshKey,
  onRestore,
  onSave,
  busy,
  platform = "apple",
}: {
  appId: string;
  scope: string;
  refreshKey: number;
  onRestore: (snapshot: PriceSnapshot) => void;
  onSave?: (label: string) => void;
  busy: boolean;
  platform?: "apple" | "google";
}) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [syncState, setSyncState] = useState<"synced" | "local-only" | null>(null);
  const [importError, setImportError] = useState("");
  const importInputId = useId();

  useEffect(() => {
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: "synced" | "local-only" }>).detail;
      if (detail?.status) setSyncState(detail.status);
    };
    window.addEventListener("storeops:snapshot-sync", handleSync);
    return () => window.removeEventListener("storeops:snapshot-sync", handleSync);
  }, []);

  useEffect(() => {
    const local = listSnapshots(appId, scope);
    queueMicrotask(() => setSnapshots(local));
    // Merge in account-synced snapshots (other devices / cleared cache)
    let cancelled = false;
    fetchServerSnapshots(appId, scope).then((server) => {
      if (cancelled || server.length === 0) return;
      const byId = new Map(local.map((s) => [s.id, s]));
      for (const s of server) if (!byId.has(s.id)) byId.set(s.id, s);
      setSnapshots(
        [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [appId, scope, refreshKey]);

  function doSave() {
    if (!saveName.trim() || !onSave) return;
    onSave(saveName.trim());
    setSaveName("");
  }

  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 mb-6">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">Price backups <span className="ml-2 font-normal text-zinc-400">{snapshots.length} saved</span></summary>
      <div className="mt-4">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="sr-only">Saved price backups</h3>
        {platform === "google" && <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Reusable restore points</span>}
        {syncState && (
          <span className={`text-[10px] ${syncState === "synced" ? "text-emerald-400" : "text-zinc-500"}`}>
            {syncState === "synced" ? "Cloud confirmed" : "Saved on this device"}
          </span>
        )}
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        {platform === "google"
          ? "Restore saved country prices. Your current prices are backed up first; completed charges and subscriber cohorts are unchanged."
          : "Restore saved country prices at Apple’s next permitted date. Completed charges cannot be reversed."}
      </p>
      {isCommunityEdition && <p className="text-xs text-zinc-300 mb-3">
        Backups stay in this browser. Before applying prices, save a backup here and download it for safekeeping. Import it here if you need it later.
      </p>}

        <div className="flex flex-wrap gap-2 mb-3">
          {onSave && <>
          <input
            aria-label="Backup name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSave()}
            placeholder="Name this backup…"
            className="flex-1 rounded-md bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={doSave}
            disabled={!saveName.trim() || busy}
            className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 transition"
          >
            Save
          </button>
          </>}
          <input
            id={importInputId}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setImportError("");
              try {
                importSnapshot(await file.text(), { appId, scope });
                setSnapshots(listSnapshots(appId, scope));
              } catch (error) {
                setImportError(
                  error instanceof Error ? error.message : "Could not import snapshot."
                );
              }
            }}
          />
          <button
            onClick={() => document.getElementById(importInputId)?.click()}
            className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition"
          >
            Import backup
          </button>
        </div>

      {importError && (
        <p className="mb-3 rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {importError}
        </p>
      )}

      {snapshots.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-2">Backups appear here when you apply prices.</p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {snapshots.map((s) => (
            <div
              key={s.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-zinc-800/70 bg-zinc-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-zinc-300 truncate">{s.label}</p>
                <p className="text-xs text-zinc-500">
                  {formatSnapshotDate(s.createdAt)} · {s.rows.length} territories
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {confirmId === s.id ? (
                  <>
                    <button
                      onClick={() => {
                        setConfirmId(null);
                        onRestore(s);
                      }}
                      disabled={busy}
                      className="text-xs rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40 transition"
                    >
                      Yes, restore
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => exportSnapshot(s)}
                      className="text-xs text-zinc-600 hover:text-zinc-300 transition"
                      title="Export as JSON"
                      aria-label={`Export snapshot: ${s.label}`}
                    >
                      Download backup
                    </button>
                    <button
                      onClick={() => setConfirmId(s.id)}
                      disabled={busy}
                      className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40 transition"
                    >
                      ↺ {platform === "google" ? "Restore pricing" : "Restore"}
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm("Delete this saved backup? Your store prices will not change.")) return;
                        deleteSnapshot(s.id);
                        setSnapshots((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                      className="text-xs text-zinc-600 hover:text-red-400"
                      title="Delete snapshot"
                      disabled={busy}
                      aria-label={`Delete snapshot: ${s.label}`}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-zinc-600">
        Up to {MAX_SNAPSHOTS_PER_SCOPE} restore points are retained per pricing
        workspace; saving another replaces the oldest point.
      </p>
      </div>
    </details>
  );
}
