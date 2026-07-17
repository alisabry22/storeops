import type { PricingStrategy } from "./pricing-strategies";

/**
 * A deliberately small, deterministic pricing policy. StoreOps must never let
 * an LLM invent a production price. The store's existing localized prices are
 * the anchor; this policy only makes a bounded, reviewable adjustment before
 * the result is snapped to an official store price point.
 */
export interface ControlledPricingPolicy {
  strategy: PricingStrategy;
  /** Largest allowed movement from the current localized price. */
  maxChangePercent: number;
}

// These are product-market bands, not a claim that GDP can predict willingness
// to pay. Unknown territories deliberately stay at the existing price.
const VALUE_MARKETS = new Set([
  "AFG", "AGO", "ARG", "BEN", "BFA", "BGD", "BOL", "BRA", "CIV", "CMR", "COD", "COG", "COL", "DZA", "ECU", "EGY", "GHA", "GMB", "GNB", "HND", "IDN", "IND", "KEN", "KHM", "KGZ", "LAO", "LBR", "LKA", "MAR", "MDA", "MDG", "MLI", "MMR", "MOZ", "MRT", "MWI", "NER", "NGA", "NIC", "NPL", "PAK", "PER", "PHL", "PNG", "PRY", "RWA", "SEN", "SLE", "SLB", "STP", "TCD", "TJK", "TUN", "TUR", "TZA", "UGA", "UKR", "UZB", "VEN", "VNM", "YEM", "ZAF", "ZMB", "ZWE",
]);
const MID_MARKETS = new Set([
  "ALB", "ARM", "AZE", "BIH", "BLR", "BGR", "CHL", "CHN", "CRI", "CYP", "CZE", "DOM", "GEO", "GRC", "GTM", "HRV", "HUN", "IRQ", "JAM", "JOR", "KAZ", "LBN", "MEX", "MKD", "MNE", "MNG", "MYS", "NAM", "PAN", "POL", "ROU", "RUS", "SRB", "SVK", "THA", "TWN", "URY",
]);

// Google Play uses ISO alpha-2 regions. Map the commonly price-sensitive
// markets; unmapped alpha-2 regions are intentionally left unchanged.
const ISO2_TO_ISO3: Record<string, string> = {
  AR: "ARG", BR: "BRA", CL: "CHL", CN: "CHN", CO: "COL", EG: "EGY", ID: "IDN", IN: "IND", KE: "KEN", MX: "MEX", NG: "NGA", PK: "PAK", PH: "PHL", TH: "THA", TR: "TUR", TW: "TWN", VN: "VNM", ZA: "ZAF",
  US: "USA", GB: "GBR", DE: "DEU", FR: "FRA", AU: "AUS", CA: "CAN", JP: "JPN", KR: "KOR", SG: "SGP",
};

function bandFor(territory: string): "value" | "mid" | "standard" {
  if (VALUE_MARKETS.has(territory)) return "value";
  if (MID_MARKETS.has(territory)) return "mid";
  return "standard";
}

export function pricingPolicyMultiplier(strategy: PricingStrategy, territory: string): number {
  const normalizedTerritory = ISO2_TO_ISO3[territory] ?? territory;
  // An unclassified Android region should never be moved by inference.
  if (territory.length === 2 && !ISO2_TO_ISO3[territory]) return 1;
  const band = bandFor(normalizedTerritory);
  switch (strategy) {
    case "ppp":
      return band === "value" ? 0.7 : band === "mid" ? 0.85 : 1;
    case "growth":
      return band === "value" ? 0.7 : band === "mid" ? 0.8 : 0.9;
    case "revenue":
      return band === "standard" ? 1.15 : band === "mid" ? 1 : 0.9;
    case "enterprise":
      return band === "standard" ? 1.2 : band === "mid" ? 1.1 : 1;
    case "retention":
    default:
      return 1;
  }
}

export function stagePriceTowardTarget(
  currentPrice: number | null,
  finalTarget: number,
  maxChangePercent: number
): number {
  if (currentPrice === null || currentPrice <= 0) return finalTarget;
  const limit = Math.max(1, Math.min(maxChangePercent, 50)) / 100;
  const minimum = currentPrice * (1 - limit);
  const maximum = currentPrice * (1 + limit);
  return Math.max(minimum, Math.min(maximum, finalTarget));
}

export function generateControlledPriceCsv(
  csv: string,
  policy: ControlledPricingPolicy
): string {
  const rows = csv.trim().split(/\r?\n/);
  if (rows.length < 2) return csv;
  const limit = Math.max(1, Math.min(policy.maxChangePercent, 50)) / 100;
  const output = ["territory,currency,price"];

  for (const raw of rows.slice(1)) {
    const [territory = "", currency = "", priceText = ""] = raw.split(",").map((v) => v.trim());
    const current = Number(priceText);
    if (!/^[A-Z]{2,3}$/.test(territory) || !currency || !Number.isFinite(current) || current <= 0) continue;
    const rawMultiplier = pricingPolicyMultiplier(policy.strategy, territory);
    const multiplier = Math.max(1 - limit, Math.min(1 + limit, rawMultiplier));
    // Keep enough precision for the store's later valid-price-point snapping.
    const target = Math.round(current * multiplier * 10_000) / 10_000;
    output.push(`${territory},${currency},${target}`);
  }
  return output.join("\n");
}
