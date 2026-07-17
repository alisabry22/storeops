"use client";

import { useState } from "react";
import { STRATEGIES, getStrategy, type PricingStrategy } from "@/lib/pricing-strategies";
import { generateControlledPriceCsv } from "@/lib/pricing-policy";

interface Props {
  /** Build the CSV to send for repricing. Called on button click. */
  getCsv: () => string;
  platform: "ios" | "android";
  strategy: PricingStrategy;
  onStrategyChange: (s: PricingStrategy) => void;
  /** Called with the raw CSV string the AI returned. Caller handles preview. */
  onResult: (csv: string) => void;
  disabled?: boolean;
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
  onExportCsv,
}: Props) {
  const [maxChangePercent, setMaxChangePercent] = useState(25);
  const [assistantInstructions, setAssistantInstructions] = useState("");
  const [assistantStatus, setAssistantStatus] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);

  async function askAssistant() {
    if (!assistantInstructions.trim()) return;
    setAssistantLoading(true);
    setAssistantStatus("");
    try {
      const response = await fetch("/api/ai-reprice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: assistantInstructions, platform }),
      });
      const data = await response.json() as { error?: string; policy?: { strategy: PricingStrategy; maxChangePercent: number; summary: string } };
      if (!response.ok || !data.policy) throw new Error(data.error ?? "Could not configure policy");
      onStrategyChange(data.policy.strategy);
      setMaxChangePercent(data.policy.maxChangePercent);
      setAssistantStatus(data.policy.summary);
    } catch (error) {
      setAssistantStatus(error instanceof Error ? error.message : "Could not configure policy");
    } finally {
      setAssistantLoading(false);
    }
  }

  function handleGenerate() {
    onResult(generateControlledPriceCsv(getCsv(), { strategy, maxChangePercent }));
  }

  return (
    <div>
      {/* Header row — export + copy prompt fallbacks */}
      {onExportCsv && (
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
        </div>
      )}

      {/* Strategy picker */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs text-zinc-500 shrink-0">Policy:</span>
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

      <div className="rounded-md border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 mb-3">
        <div className="flex gap-2 mb-2">
          <input
            value={assistantInstructions}
            onChange={(e) => setAssistantInstructions(e.target.value)}
            placeholder="Ask AI: “Keep changes gentle; make emerging markets more accessible.”"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
          />
          <button onClick={askAssistant} disabled={!assistantInstructions.trim() || assistantLoading} className="rounded border border-emerald-800 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950 disabled:opacity-40">
            {assistantLoading ? "Thinking…" : "Ask AI"}
          </button>
        </div>
        {assistantStatus && <p className="mb-2 text-[11px] text-zinc-400">{assistantStatus}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs text-zinc-300 flex items-center gap-2">
            Maximum movement per territory
            <input
              type="number"
              min={1}
              max={50}
              value={maxChangePercent}
              onChange={(e) => setMaxChangePercent(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-right text-zinc-100 focus:border-emerald-500 focus:outline-none"
            />
            %
          </label>
          <span className="text-[11px] text-zinc-500">Uses current localized store prices as the anchor.</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
          This is deterministic and bounded—not an AI prediction of demand. It uses the current {platform === "ios" ? "App Store" : "Google Play"} localized prices as its source; unknown markets remain unchanged and every result still requires review.
        </p>
      </div>

      {/* AI Reprice button */}
      <button
        onClick={handleGenerate}
        disabled={disabled}
        className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition mb-4"
      >
        {`Generate bounded preview · ${getStrategy(strategy).emoji} ${getStrategy(strategy).label}`}
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
