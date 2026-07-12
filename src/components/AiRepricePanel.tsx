"use client";

import { useState } from "react";
import { STRATEGIES, getStrategy, type PricingStrategy } from "@/lib/pricing-strategies";

interface Props {
  /** Build the CSV to send for repricing. Called on button click. */
  getCsv: () => string;
  platform: "ios" | "android";
  strategy: PricingStrategy;
  onStrategyChange: (s: PricingStrategy) => void;
  /** Called with the raw CSV string the AI returned. Caller handles preview. */
  onResult: (csv: string) => void;
  disabled?: boolean;
  /** Show the "Copy prompt" fallback button */
  onCopyPrompt?: () => void;
  copiedPrompt?: boolean;
  /** Show the "Export CSV" button */
  onExportCsv?: () => void;
}

export function AiRepricePanel({
  getCsv,
  platform,
  strategy,
  onStrategyChange,
  onResult,
  disabled,
  onCopyPrompt,
  copiedPrompt,
  onExportCsv,
}: Props) {
  const [customInstructions, setCustomInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReprice() {
    setLoading(true);
    setError("");
    try {
      const csv = getCsv();
      const res = await fetch("/api/ai-reprice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, strategy, customInstructions, platform }),
      });
      const data = await res.json() as { csv?: string; error?: string };
      if (!res.ok || !data.csv) throw new Error(data.error ?? "AI reprice failed");
      onResult(data.csv);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI reprice failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Header row — export + copy prompt fallbacks */}
      {(onExportCsv || onCopyPrompt) && (
        <div className="flex gap-2 mb-3">
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              disabled={disabled}
              className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-40 transition"
            >
              ↓ Export CSV
            </button>
          )}
          {onCopyPrompt && (
            <button
              onClick={onCopyPrompt}
              disabled={disabled}
              className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:border-zinc-500 disabled:opacity-40 transition"
            >
              {copiedPrompt ? "Copied ✓" : "⧉ Copy prompt"}
            </button>
          )}
        </div>
      )}

      {/* Strategy picker */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs text-zinc-500 shrink-0">Objective:</span>
        {STRATEGIES.map((s) => (
          <button
            key={s.key}
            onClick={() => onStrategyChange(s.key)}
            title={s.tagline}
            className={`text-xs rounded-md px-2.5 py-1 border transition ${
              strategy === s.key
                ? "bg-emerald-900/60 border-emerald-700 text-emerald-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {s.emoji} {s.label}
            {s.star && <span className="ml-1 text-amber-400 text-[10px]">★</span>}
          </button>
        ))}
      </div>

      {/* Custom instructions */}
      <textarea
        value={customInstructions}
        onChange={(e) => setCustomInstructions(e.target.value)}
        placeholder="Optional: add your own rules — e.g. keep Egypt under EGP 150, make India aggressive, don't touch US price..."
        rows={2}
        className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none resize-none mb-3"
      />

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {/* AI Reprice button */}
      <button
        onClick={handleReprice}
        disabled={disabled || loading}
        className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition mb-4"
      >
        {loading
          ? "Repricing…"
          : `✦ AI Reprice · ${getStrategy(strategy).emoji} ${getStrategy(strategy).label}`}
      </button>

      {/* Divider to paste-your-own section */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="text-xs text-zinc-600">or paste your own CSV</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>
    </div>
  );
}
