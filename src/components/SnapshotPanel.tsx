"use client";

import { useEffect, useState } from "react";
import {
  deleteSnapshot,
  exportSnapshot,
  formatSnapshotDate,
  listSnapshots,
  type PriceSnapshot,
} from "@/lib/snapshots";
import { fetchServerSnapshots } from "@/lib/snapshot-sync";

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
}: {
  appId: string;
  scope: string;
  refreshKey: number;
  onRestore: (snapshot: PriceSnapshot) => void;
  onSave?: (label: string) => void;
  busy: boolean;
}) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    const local = listSnapshots(appId, scope);
    setSnapshots(local);
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

  if (snapshots.length === 0 && !onSave) return null;

  function doSave() {
    if (!saveName.trim() || !onSave) return;
    onSave(saveName.trim());
    setSaveName("");
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 mb-6">
      <h3 className="text-sm font-semibold mb-1">
        Snapshots{" "}
        <span className="text-zinc-500 font-normal">
          — taken automatically before every apply
        </span>
      </h3>
      <p className="text-xs text-zinc-500 mb-3">
        Made a mistake? Restore any snapshot and your prices go back exactly as
        they were. Export to keep a backup outside the browser.
      </p>

      {onSave && (
        <div className="flex gap-2 mb-3">
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSave()}
            placeholder="Name this snapshot (e.g. Before Black Friday)…"
            className="flex-1 rounded-md bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
          />
          <button
            onClick={doSave}
            disabled={!saveName.trim()}
            className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 transition"
          >
            Save
          </button>
        </div>
      )}

      {snapshots.length === 0 ? (
        <p className="text-xs text-zinc-600 text-center py-2">No snapshots yet</p>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {snapshots.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-800/70 bg-zinc-950/50 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-zinc-300 truncate">{s.label}</p>
                <p className="text-xs text-zinc-500">
                  {formatSnapshotDate(s.createdAt)} · {s.rows.length} territories
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                      ↓ JSON
                    </button>
                    <button
                      onClick={() => setConfirmId(s.id)}
                      disabled={busy}
                      className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40 transition"
                    >
                      ↺ Restore
                    </button>
                    <button
                      onClick={() => {
                        deleteSnapshot(s.id);
                        setSnapshots((prev) => prev.filter((x) => x.id !== s.id));
                      }}
                      className="text-xs text-zinc-600 hover:text-red-400"
                      title="Delete snapshot"
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
    </div>
  );
}
