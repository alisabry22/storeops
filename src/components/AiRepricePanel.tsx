"use client";

import { useState } from "react";
import { type PricingStrategy } from "@/lib/pricing-strategies";
import { generateControlledPriceCsv } from "@/lib/pricing-policy";
import { PricingStrategyPicker } from "./PricingStrategyPicker";

interface Props {
  getCsv: () => string;
  platform: "ios" | "android";
  strategy: PricingStrategy;
  onStrategyChange: (strategy: PricingStrategy) => void;
  onResult: (csv: string, maxChangePercent: number) => void | Promise<void>;
  disabled?: boolean;
  onExportCsv?: () => void;
}

export function AiRepricePanel({ getCsv, platform, strategy, onStrategyChange, onResult, disabled, onExportCsv }: Props) {
  const [maxChangePercent, setMaxChangePercent] = useState(25);
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState("");
  const [asking, setAsking] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function askAssistant() {
    setAsking(true);
    setStatus("");
    try {
      const response = await fetch("/api/ai-reprice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instructions, platform }) });
      const data = await response.json() as { error?: string; policy?: { strategy: PricingStrategy; maxChangePercent: number; summary: string } };
      if (!response.ok || !data.policy) throw new Error(data.error ?? "Could not suggest a pricing goal. Choose one above instead.");
      onStrategyChange(data.policy.strategy);
      setMaxChangePercent(data.policy.maxChangePercent);
      setStatus(data.policy.summary);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not suggest a pricing goal."); }
    finally { setAsking(false); }
  }

  async function generate() {
    setGenerating(true);
    setStatus("");
    try { await onResult(generateControlledPriceCsv(getCsv(), { strategy, maxChangePercent }), maxChangePercent); }
    catch (error) { setStatus(error instanceof Error ? error.message : "Preview failed. Try again."); }
    finally { setGenerating(false); }
  }

  return <div className="space-y-4 mb-4">
    <PricingStrategyPicker value={strategy} onChange={onStrategyChange} disabled={disabled || generating || asking} />
    <details className="app-advanced">
      <summary>Change limits &amp; AI help</summary>
      <div className="space-y-4">
        <label className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">Limit changes to existing prices
          <span className="flex items-center gap-2"><input type="number" min={1} max={50} value={maxChangePercent}
            onChange={(event) => setMaxChangePercent(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
            className="min-h-11 w-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-zinc-100" />%</span>
        </label>
        <label className="block text-sm text-zinc-300"><span className="mb-2 block">Describe your pricing goal (optional)</span>
          <input value={instructions} onChange={(event) => setInstructions(event.target.value)}
            placeholder="For example, make prices more accessible…"
            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm" />
        </label>
        <button type="button" onClick={askAssistant} disabled={!instructions.trim() || asking || generating}
          className="min-h-11 rounded-md border border-zinc-700 px-4 text-sm text-zinc-200 hover:border-emerald-600 disabled:opacity-50">
          {asking ? "Suggesting a goal…" : "Suggest a goal with AI"}
        </button>
        <p className="text-xs text-zinc-400">Uses current store prices and fixed market rules. These suggestions do not predict sales.</p>
        {onExportCsv && <button type="button" onClick={onExportCsv} disabled={disabled}
          className="min-h-11 rounded-md border border-zinc-700 px-4 text-sm text-zinc-300 hover:border-zinc-500 disabled:opacity-50">Download current prices</button>}
      </div>
    </details>
    {status && <p role="status" className="text-sm text-zinc-300">{status}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={generate} disabled={disabled || generating || asking}
        className="min-h-11 rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {generating ? "Calculating local prices…" : "Preview price changes"}
      </button>
      <span className="text-xs text-zinc-400">Nothing changes until you review &amp; apply.</span>
    </div>
  </div>;
}
