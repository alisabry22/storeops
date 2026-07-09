"use client";

import { useEffect, useState } from "react";
import {
  deleteSnapshot,
  formatSnapshotDate,
  listSnapshots,
  type PriceSnapshot,
} from "@/lib/snapshots";

/**
 * Snapshots list with one-click restore — the undo button.
 * refreshKey: bump after every apply so the list re-reads localStorage.
 */
export function SnapshotPanel({
  appId,
  scope,
  refreshKey,
  onRestore,
  busy,
}: {
  appId: string;
  scope: string;
  refreshKey: number;
  onRestore: (snapshot: PriceSnapshot) => void;
  busy: boolean;
}) {
  const [snapshots, setSnapshots] = useState<PriceSnapshot[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    setSnapshots(listSnapshots(appId, scope));
  }, [appId, scope, refreshKey]);

  if (snapshots.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 mb-6">
      <h3 className="text-sm font-semibold mb-1">
        Snapshots{" "}
        <span className="text-zinc-500 font-normal">
          — taken automatically before every apply
        </span>
      </h3>
      <p className="text-xs text-zinc-500 mb-3">
        Made a mistake? Restore any snapshot and your prices go back exactly
        as they were.
      </p>
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
                    onClick={() => setConfirmId(s.id)}
                    disabled={busy}
                    className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-amber-500 hover:text-amber-400 disabled:opacity-40 transition"
                  >
                    ↺ Restore
                  </button>
                  <button
                    onClick={() => {
                      deleteSnapshot(s.id);
                      setSnapshots(listSnapshots(appId, scope));
                    }}
                    className="text-xs text-zinc-600 hover:text-red-400"
                    title="Delete snapshot"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
