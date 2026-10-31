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
  { key: "ppp", label: "Market access", tagline: "Lower prices in price-sensitive markets", emoji: "⚖️" },
  { key: "growth", label: "Growth", tagline: "Lower prices across all markets", emoji: "🚀" },
  { key: "revenue", label: "Revenue", tagline: "Higher in standard markets, lower in value markets", emoji: "💰" },
  { key: "retention", label: "Keep baseline", tagline: "Use store prices without a market adjustment", emoji: "🔒" },
  { key: "enterprise", label: "Premium", tagline: "Higher prices in mid and standard markets", emoji: "🏢" },
];

export function getStrategy(key: PricingStrategy): Strategy {
  return STRATEGIES.find((strategy) => strategy.key === key) ?? STRATEGIES[0];
}
