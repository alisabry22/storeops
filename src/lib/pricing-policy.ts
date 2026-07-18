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

export interface MovementCapViolation {
  territoryId: string;
  currentPrice: number;
  nextPrice: number;
  movementPercent: number;
}

// These are product-market bands, not a claim that GDP can predict willingness
// to pay. Unknown territories deliberately stay at the existing price.
const VALUE_MARKETS = new Set([
  "AFG", "AGO", "ARG", "BEN", "BFA", "BGD", "BOL", "BRA", "CIV", "CMR", "COD", "COG", "COL", "DZA", "ECU", "EGY", "GHA", "GMB", "GNB", "HND", "IDN", "IND", "KEN", "KHM", "KGZ", "LAO", "LBR", "LKA", "MAR", "MDA", "MDG", "MLI", "MMR", "MOZ", "MRT", "MWI", "NER", "NGA", "NIC", "NPL", "PAK", "PER", "PHL", "PNG", "PRY", "RWA", "SEN", "SLE", "SLB", "STP", "TCD", "TJK", "TUN", "TUR", "TZA", "UGA", "UKR", "UZB", "VEN", "VNM", "YEM", "ZAF", "ZMB", "ZWE",
]);
const MID_MARKETS = new Set([
  "ALB", "ARM", "AZE", "BIH", "BLR", "BGR", "CHL", "CHN", "CRI", "CYP", "CZE", "DOM", "GEO", "GRC", "GTM", "HRV", "HUN", "IRQ", "JAM", "JOR", "KAZ", "LBN", "MEX", "MKD", "MNE", "MNG", "MYS", "NAM", "PAN", "POL", "ROU", "RUS", "SRB", "SVK", "THA", "TWN", "URY",
]);

// Google Play uses ISO alpha-2 regions. Keep the complete policy-band sets in
// both store formats so an Android market never stays unchanged merely because
// its code has two letters instead of Apple's three.
const VALUE_MARKETS_ISO2 = new Set([
  "AF", "AO", "AR", "BJ", "BF", "BD", "BO", "BR", "CI", "CM", "CD", "CG", "CO", "DZ", "EC", "EG", "GH", "GM", "GW", "HN", "ID", "IN", "KE", "KH", "KG", "LA", "LR", "LK", "MA", "MD", "MG", "ML", "MM", "MZ", "MR", "MW", "NE", "NG", "NI", "NP", "PK", "PE", "PH", "PG", "PY", "RW", "SN", "SL", "SB", "ST", "TD", "TJ", "TN", "TR", "TZ", "UG", "UA", "UZ", "VE", "VN", "YE", "ZA", "ZM", "ZW",
]);
const MID_MARKETS_ISO2 = new Set([
  "AL", "AM", "AZ", "BA", "BY", "BG", "CL", "CN", "CR", "CY", "CZ", "DO", "GE", "GR", "GT", "HR", "HU", "IQ", "JM", "JO", "KZ", "LB", "MX", "MK", "ME", "MN", "MY", "NA", "PA", "PL", "RO", "RU", "RS", "SK", "TH", "TW", "UY",
]);

function bandFor(territory: string): "value" | "mid" | "standard" {
  if (VALUE_MARKETS_ISO2.has(territory)) return "value";
  if (MID_MARKETS_ISO2.has(territory)) return "mid";
  if (VALUE_MARKETS.has(territory)) return "value";
  if (MID_MARKETS.has(territory)) return "mid";
  return "standard";
}

export function pricingPolicyMultiplier(strategy: PricingStrategy, territory: string): number {
  const band = bandFor(territory);
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

/**
 * Validate the final store-approved values, not just the intermediate policy
 * targets. Apple tier snapping and Google regional normalization can otherwise
 * move a price beyond the cap after the preview was generated.
 */
export function findMovementCapViolations(
  currentPrices: ReadonlyMap<string, number>,
  nextPrices: ReadonlyMap<string, number>,
  maxChangePercent: number,
  tolerancePercent = 0.001
): MovementCapViolation[] {
  const cap = Math.max(1, Math.min(maxChangePercent, 50));
  const violations: MovementCapViolation[] = [];
  for (const [territoryId, nextPrice] of nextPrices) {
    const currentPrice = currentPrices.get(territoryId);
    if (
      currentPrice === undefined ||
      currentPrice <= 0 ||
      !Number.isFinite(currentPrice) ||
      !Number.isFinite(nextPrice)
    ) {
      continue;
    }
    const movementPercent =
      (Math.abs(nextPrice - currentPrice) / currentPrice) * 100;
    if (movementPercent - cap > tolerancePercent) {
      violations.push({
        territoryId,
        currentPrice,
        nextPrice,
        movementPercent,
      });
    }
  }
  return violations;
}

export function movementCapErrorMessage(
  violations: MovementCapViolation[],
  maxChangePercent: number
): string {
  const regions = violations
    .slice(0, 6)
    .map((item) => `${item.territoryId} (${item.movementPercent.toFixed(1)}%)`)
    .join(", ");
  return `Final store-valid prices exceed the ${maxChangePercent}% movement cap for ${regions}${violations.length > 6 ? "…" : ""}. Nothing was written. Lower the target, increase the cap, or explicitly choose the full-target override.`;
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
