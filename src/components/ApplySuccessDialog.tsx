"use client";

import { useEffect } from "react";

interface Props {
  productLabel: string;
  regionsChanged: number;
  warnings?: string[];
  verified?: boolean;
  onClose: () => void;
}

export function ApplySuccessDialog({
  productLabel,
  regionsChanged,
  warnings = [],
  verified = false,
  onClose,
}: Props) {
  const noChanges = regionsChanged === 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-950/60 border border-emerald-700 text-emerald-400 text-xl">
              ✓
            </div>
            <h2 className="text-base font-semibold text-white">
              {noChanges
                ? "No price changes were needed"
                : verified
                  ? "Prices applied and verified"
                  : "Prices applied successfully"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-4">
          {noChanges
            ? "The live configuration already matched, or every requested row was safely skipped. Review the notes below for the exact reason."
            : verified
            ? "The store accepted the update, and StoreOps re-read the live regional grid to confirm the requested prices."
            : "We submitted your new prices to the store. Review the store console for the scheduled effective date and any subscriber notices Apple requires."}
        </p>

        <dl className="text-sm space-y-2 mb-4 rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-3">
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">Product</dt>
            <dd className="text-zinc-200 font-mono text-right truncate">{productLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-500">
              {verified ? "Regions updated and verified" : "Regions updated"}
            </dt>
            <dd className="text-zinc-200">{regionsChanged}</dd>
          </div>
        </dl>

        {warnings.length > 0 && (
          <details className="mb-4 rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-sm">
            <summary className="cursor-pointer text-amber-400 select-none">
              {warnings.length} note{warnings.length === 1 ? "" : "s"} from this run
            </summary>
            <ul className="mt-2 space-y-1 text-amber-300/80 text-xs leading-relaxed">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}
