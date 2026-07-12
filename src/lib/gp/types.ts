/**
 * Google Play Developer API types — only the fields we touch.
 * Prices come in two shapes: legacy micros (in-app products) and
 * Money units+nanos (subscriptions). Helpers normalize both to
 * decimal strings for display/CSV.
 */

/** Legacy price shape used by inappproducts (1e6 micros = 1 unit). */
export interface GpMicrosPrice {
  priceMicros: string;
  currency: string;
}

/** Money shape used by subscriptions (units + 1e-9 nanos). */
export interface GpMoney {
  currencyCode: string;
  units?: string;
  nanos?: number;
}

export interface GpInAppProduct {
  packageName: string;
  sku: string;
  status?: string;
  purchaseType?: "managedUser" | "subscription" | string;
  defaultLanguage?: string;
  defaultPrice?: GpMicrosPrice;
  prices?: Record<string, GpMicrosPrice>;
  listings?: Record<string, { title?: string; description?: string }>;
}

/**
 * New-style monetization one-time product. Apps migrated to Google's new
 * Publishing API return this shape from /oneTimeProducts and reject the
 * legacy /inappproducts path with 403 "Please migrate to the new publishing
 * API". Prices live on `purchaseOptions[].regionalPricingAndAvailabilityConfigs`
 * as `Money` objects (currencyCode/units/nanos), not as the legacy micros map.
 */
export interface GpOneTimeProduct {
  packageName: string;
  productId: string;
  listings?: Array<{ languageCode?: string; title?: string; description?: string }>;
  purchaseOptions?: Array<{
    purchaseOptionId: string;
    state?: string;
    buyOption?: unknown;
    regionalPricingAndAvailabilityConfigs?: Array<{
      regionCode: string;
      price?: GpMoney;
      availability?: string;
    }>;
    newRegionsConfig?: unknown;
  }>;
  offerTags?: Array<{ tag?: string }>;
  regionsVersion?: { version?: string };
}

export interface GpRegionalConfig {
  regionCode: string;
  price?: GpMoney;
  newSubscriberAvailability?: boolean;
}

export interface GpBasePlan {
  basePlanId: string;
  state?: string;
  regionalConfigs?: GpRegionalConfig[];
  autoRenewingBasePlanType?: unknown;
  prepaidBasePlanType?: unknown;
  otherRegionsConfig?: unknown;
}

export interface GpSubscription {
  packageName: string;
  productId: string;
  basePlans?: GpBasePlan[];
  listings?: Array<{ languageCode?: string; title?: string }>;
  archived?: boolean;
}

/**
 * Required currencies per region under Google Play's regions version 2022/02.
 * Subscriptions created before this spec can have stale currency codes (e.g. EUR
 * for Bulgaria). Sending a PATCH with a mismatched currency causes a 400 even for
 * regions you didn't touch, because Google re-validates the entire regionalConfigs
 * array. Correct these before building the update payload.
 */
export const GP_REQUIRED_CURRENCY_2022_02: Record<string, string> = {
  BG: "BGN", // Bulgaria — confirmed by API error
  CZ: "CZK", // Czech Republic
  DK: "DKK", // Denmark
  HU: "HUF", // Hungary
  PL: "PLN", // Poland
  RO: "RON", // Romania
  SE: "SEK", // Sweden
  CH: "CHF", // Switzerland
  NO: "NOK", // Norway
  GB: "GBP", // United Kingdom
  IS: "EUR", // Iceland — Google Play uses EUR, not ISK (confirmed by API)
  TR: "TRY", // Turkey
  UA: "UAH", // Ukraine
  RS: "RSD", // Serbia
  // Africa — confirmed by live API errors
  CI: "USD", // Côte d'Ivoire (XOF → USD, confirmed)
  CM: "USD", // Cameroon (XAF → USD, confirmed)
  SN: "USD", // Senegal (XOF → USD, confirmed)
  GH: "GHS", // Ghana (confirmed — NOT USD)
  KE: "KES", // Kenya (confirmed — NOT USD)
};

/**
 * Returns the correct currency for a region under the 2022/02 spec.
 * Falls back to `existingCurrency` for regions not in the override map.
 */
export function requiredCurrency(regionCode: string, existingCurrency: string): string {
  return GP_REQUIRED_CURRENCY_2022_02[regionCode] ?? existingCurrency;
}

/** One row of the unified Play pricing table (regionCode is ISO 3166-1 alpha-2). */
export interface GpPriceRow {
  regionCode: string;
  currency: string;
  price: string;
}

export function microsToDecimal(micros: string): string {
  const n = Number(micros) / 1_000_000;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function decimalToMicros(price: number): string {
  return String(Math.round(price * 1_000_000));
}

export function moneyToDecimal(m: GpMoney): string {
  const units = Number(m.units ?? 0);
  const nanos = (m.nanos ?? 0) / 1_000_000_000;
  const n = units + nanos;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function decimalToMoney(price: number, currencyCode: string): GpMoney {
  const units = Math.trunc(price);
  const nanos = Math.round((price - units) * 1_000_000_000);
  return { currencyCode, units: String(units), nanos };
}
