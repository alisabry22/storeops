"use client";

import { useState, useEffect } from "react";

interface Props {
  open: boolean;
  defaultName?: string;
  onSaveAndApply: (name: string) => void;
  onSkipAndApply: () => void;
  onCancel: () => void;
}

export function SnapshotConfirmDialog({ open, defaultName = "", onSaveAndApply, onSkipAndApply, onCancel }: Props) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📸</div>
            <h2 className="text-base font-semibold text-white">Save a snapshot first?</h2>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none">×</button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          Snapshots let you <span className="text-zinc-200">revert to any previous price configuration</span> with one click — useful if something looks off after applying.
        </p>

        <label className="block mb-4">
          <span className="text-xs text-zinc-500 mb-1.5 block">Snapshot name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Before PPP reprice — July 2026"
            className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onSaveAndApply(name.trim() || defaultName)}
            className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition flex items-center justify-center gap-2"
          >
            <span>✓</span> Save snapshot &amp; apply
            <span className="ml-auto text-xs font-normal bg-emerald-800 text-emerald-300 px-1.5 py-0.5 rounded">Recommended</span>
          </button>
          <button
            onClick={onSkipAndApply}
            className="w-full rounded-lg border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition"
          >
            Skip &amp; apply anyway
          </button>
        </div>
      </div>
    </div>
  );
}
