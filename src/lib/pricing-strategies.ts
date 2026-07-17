/** Bounded, deterministic policy profiles used by pricing-policy.ts. */
export type PricingStrategy = "ppp" | "growth" | "revenue" | "retention" | "enterprise";

export interface Strategy {
  key: PricingStrategy;
  label: string;
  tagline: string;
  emoji: string;
  star?: boolean;
}

export const STRATEGIES: Strategy[] = [
  { key: "ppp", label: "Market access", tagline: "Controlled regional adjustment", emoji: "⚖️" },
  { key: "growth", label: "Growth", tagline: "Conservative acquisition test", emoji: "🚀" },
  { key: "revenue", label: "Revenue", tagline: "Bounded revenue hypothesis", emoji: "💰", star: true },
  { key: "retention", label: "Retention", tagline: "No automatic price movement", emoji: "🔒" },
  { key: "enterprise", label: "Professional", tagline: "Bounded professional positioning", emoji: "🏢" },
];

export function getStrategy(key: PricingStrategy): Strategy {
  return STRATEGIES.find((strategy) => strategy.key === key) ?? STRATEGIES[0];
}
