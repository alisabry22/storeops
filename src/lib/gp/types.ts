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
