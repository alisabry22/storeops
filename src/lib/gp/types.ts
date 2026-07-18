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

export interface GpConvertedRegionPrice {
  regionCode: string;
  price: GpMoney;
  taxAmount?: GpMoney;
}

export interface GpConvertRegionPricesResponse {
  convertedRegionPrices?: Record<string, GpConvertedRegionPrice>;
  convertedOtherRegionsPrice?: { usdPrice?: GpMoney; eurPrice?: GpMoney };
  regionVersion?: { version?: string };
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
 * Do not hard-code billability: it belongs to the RegionsVersion returned by
 * Google and can change. The apply loop learns a non-billable region from the
 * API response for the exact version used by that write.
 */
export const GP_NOT_BILLABLE = new Set<string>();

/**
 * Preserve the currency Google returned with the live product. Currency
 * assignments change over time and can also vary by Google's regions version;
 * hard-coded overrides turned 14,200 XOF into 14,200 USD for Côte d'Ivoire.
 * Changed prices get their authoritative currency from convertRegionPrices.
 * If an untouched legacy config is stale, the PATCH error supplies the current
 * expected currency and the apply loop corrects that specific config.
 */
export function requiredCurrency(_regionCode: string, existingCurrency: string): string {
  return existingCurrency;
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
  // Preserve the precision Google returned. Rounding this to two decimals can
  // create false verification failures for currencies and price points that
  // legitimately use more precision.
  return String(Math.round(n * 1_000_000_000) / 1_000_000_000);
}

export function decimalToMoney(price: number, currencyCode: string): GpMoney {
  const units = Math.trunc(price);
  const nanos = Math.round((price - units) * 1_000_000_000);
  return { currencyCode, units: String(units), nanos };
}
