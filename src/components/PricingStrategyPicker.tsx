"use client";

import { useId } from "react";
import { STRATEGIES, type PricingStrategy } from "@/lib/pricing-strategies";
import { AppIcon, type AppIconName } from "./AppIcon";

const icons: Record<PricingStrategy, AppIconName> = { ppp: "globe", growth: "growth", revenue: "revenue", retention: "retention", enterprise: "enterprise" };

export function PricingStrategyPicker({ value, onChange, disabled = false }: { value: PricingStrategy; onChange: (value: PricingStrategy) => void; disabled?: boolean }) {
  const name = useId();
  return <fieldset className="min-w-0" disabled={disabled}>
    <legend className="mb-3 text-sm font-medium text-zinc-200">What is your pricing goal?</legend>
    <div className="strategy-picker">
      {STRATEGIES.map((strategy) => <label key={strategy.key} className={`strategy-option ${value === strategy.key ? "is-selected" : ""}`}>
        <input type="radio" name={name} value={strategy.key} checked={value === strategy.key} onChange={() => onChange(strategy.key)} className="absolute inset-0 z-10 size-full cursor-pointer opacity-0" />
        <AppIcon name={icons[strategy.key]} className="size-5 shrink-0" />
        <span><span className="block text-sm font-medium">{strategy.label}</span><span className="mt-1 block text-xs leading-relaxed text-zinc-400">{strategy.tagline}</span></span>
        {value === strategy.key && <AppIcon name="check" className="ml-auto size-4 shrink-0" />}
      </label>)}
    </div>
  </fieldset>;
}
