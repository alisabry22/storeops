/**
 * AI repricing strategies — each one builds a different prompt that steers
 * the model toward a specific business objective.
 */

export type PricingStrategy = "ppp" | "growth" | "revenue" | "retention" | "enterprise";

export interface Strategy {
  key: PricingStrategy;
  label: string;
  tagline: string;
  emoji: string;
  star?: boolean;
  buildPrompt: (csv: string) => string;
}

export const STRATEGIES: Strategy[] = [
  {
    key: "ppp",
    label: "PPP",
    tagline: "Fair worldwide pricing",
    emoji: "⚖️",
    buildPrompt: (csv) => `I'm pricing my iOS app across all App Store territories. Below are my current prices (territory = ISO 3166-1 alpha-3, price = local currency).

OBJECTIVE: Purchasing Power Parity. Adjust prices so the app costs the same fraction of average monthly income in every market. Use GDP per capita data. A user in Egypt or India should feel the same "effort" to buy as a user in the US.

Rules:
- Keep psychological pricing (x.99 endings, or local equivalent like x.90 in JP)
- Don't change a price by less than 10% — rounding noise isn't worth the churn
- Reply ONLY with a CSV in the exact same format. Include every territory you want changed; omit territories to keep their current price.

${csv}`,
  },
  {
    key: "growth",
    label: "Growth",
    tagline: "Maximize downloads",
    emoji: "🚀",
    buildPrompt: (csv) => `I'm pricing my iOS app across all App Store territories. Below are my current prices (territory = ISO 3166-1 alpha-3, price = local currency).

OBJECTIVE: Growth. I want to maximize total download volume and new user acquisition. Price this app aggressively — especially in emerging markets where the current price is a barrier. Volume matters more than margin right now.

Rules:
- Mature markets (USA, GBR, DEU, FRA, AUS, JPN, CAN, KOR, SGP): reduce by 20-30%, keep above the $0.99 floor — a low price that still signals quality
- Price-sensitive markets (EGY, IND, BRA, IDN, PHL, VNM, PAK, BGD, NGA, KEN): reduce by 40-60% — bring to the lowest tier that isn't free
- Middle markets (MEX, TUR, THA, MYS, COL, ARG): reduce by 25-40%
- Use psychological pricing (x.99 or x.49 endings)
- Reply ONLY with a CSV in the exact same format. Include every territory you want changed; omit territories to keep their current price.

${csv}`,
  },
  {
    key: "revenue",
    label: "Max Revenue",
    tagline: "Price what the market bears",
    emoji: "💰",
    star: true,
    buildPrompt: (csv) => `I'm pricing my iOS app across all App Store territories. Below are my current prices (territory = ISO 3166-1 alpha-3, price = local currency).

OBJECTIVE: Maximize total revenue. Price at the highest amount that the market will realistically convert at — not the absolute maximum, but the revenue-optimizing price where demand × price is greatest. An unaffordable price generates $0.

Rules:
- High-income markets (USA, CHE, NOR, DNK, SWE, GBR, DEU, NLD, AUS, SGP, JPN): push to the tier just below where conversion drops — typically 20-30% above current if underpriced
- Mid-income markets (KOR, ITA, ESP, FRA, CAN, NZL): price at fair market value for professional apps
- Emerging markets (EGY, IND, BRA, IDN, MEX, TUR, THA): price at the local conversion-maximizing point, NOT at PPP — apps still need to feel accessible but not cheap
- Avoid price drops in markets where you're already converting well
- Use x.99 pricing
- Reply ONLY with a CSV in the exact same format. Include every territory you want changed; omit territories to keep their current price.

${csv}`,
  },
  {
    key: "retention",
    label: "Retention",
    tagline: "Protect existing subscribers",
    emoji: "🔒",
    buildPrompt: (csv) => `I'm pricing my iOS app across all App Store territories. Below are my current prices (territory = ISO 3166-1 alpha-3, price = local currency).

OBJECTIVE: Retention. I have existing subscribers I do NOT want to churn. Minimize price changes — existing subscribers are grandfathered at their current price, but I want to avoid large increases that might cause them to reconsider when they see the new price.

Rules:
- Only change territories where the current price is significantly miscalibrated (more than 30% off from PPP-fair pricing)
- Prefer GRADUAL adjustments — if a price needs to go from $1 to $4, suggest $2 this cycle
- Stability is more important than optimization
- Round to clean numbers ($2.99, $4.99, $9.99) — this reduces the psychological impact of the change
- For territories where the price is reasonable, return the SAME value (no change)
- Reply ONLY with a CSV in the exact same format. Include every territory you want changed; omit territories to keep their current price.

${csv}`,
  },
  {
    key: "enterprise",
    label: "Enterprise",
    tagline: "Price for professional buyers",
    emoji: "🏢",
    buildPrompt: (csv) => `I'm pricing my iOS app across all App Store territories. Below are my current prices (territory = ISO 3166-1 alpha-3, price = local currency).

OBJECTIVE: Enterprise / Professional pricing. This app targets business users and professionals who expense purchases. Price it accordingly — higher floors, round numbers preferred, focus on markets with strong enterprise tech spending.

Rules:
- Enterprise-heavy markets (USA, GBR, DEU, FRA, AUS, JPN, SGP, CAN, NLD, CHE): price at $4.99+ minimum, prefer $9.99, $14.99, $19.99 round tiers
- Use round-ish numbers preferred in B2B contexts ($9.99, $14.99, $24.99) over consumer patterns ($0.99, $2.99)
- Emerging markets can have a lower tier but still professional: minimum $2.99 equivalent purchasing power
- Don't price below $0.99 in any market — it signals toy pricing, not professional
- Reply ONLY with a CSV in the exact same format. Include every territory you want changed; omit territories to keep their current price.

${csv}`,
  },
];

export function getStrategy(key: PricingStrategy): Strategy {
  return STRATEGIES.find((s) => s.key === key) ?? STRATEGIES[0];
}
