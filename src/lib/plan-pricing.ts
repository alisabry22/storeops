import { snapToPricePoint } from "./pricing-import";
import { pricingPolicyMultiplier } from "./pricing-policy";
import type { PricingStrategy } from "./pricing-strategies";
import type { SubPriceRow, SubscriptionPricePoint } from "./asc/types";

export type PlanRelationship = "reference-discount" | "target-discount" | "independent";

export interface PlanPricingSettings {
  strategy: PricingStrategy;
  relationship: PlanRelationship;
  annualDiscountPercent: number;
  /** null explicitly opts into the full target instead of a staged movement. */
  maxChangePercent: number | null;
}

export interface PlanPricingSource {
  subscriptionId: string;
  name: string;
  prices: SubPriceRow[];
  anchor: SubscriptionPricePoint;
  baseline: Map<string, { point: SubscriptionPricePoint; currency: string }>;
  points: Map<string, SubscriptionPricePoint[]>;
}

export interface PlanPriceCell {
  currentPrice: string | null;
  price: string;
  pointId: string;
  target: number;
  changePercent: number | null;
  changed: boolean;
  staged: boolean;
}

export interface PlanPricingRow {
  territoryId: string;
  currency: string;
  monthly: PlanPriceCell | null;
  yearly: PlanPriceCell | null;
  savingsPercent: number | null;
  targetSavingsPercent: number;
  issues: string[];
}

/** Historical and scheduled prices must never masquerade as today's price. */
export function activeSubscriptionPrices(prices: SubPriceRow[], today = new Date().toISOString().slice(0, 10)): SubPriceRow[] {
  const active = new Map<string, SubPriceRow>();
  for (const price of prices) {
    if (price.startDate && price.startDate > today) continue;
    const previous = active.get(price.territoryId);
    if (!previous || (price.startDate ?? "") > (previous.startDate ?? "")) active.set(price.territoryId, price);
  }
  return [...active.values()];
}

export function annualSavings(monthly: number, yearly: number): number {
  return (1 - yearly / (monthly * 12)) * 100;
}

function resolveCell(source: PlanPricingSource, territoryId: string, target: number, cap: number | null): PlanPriceCell | null {
  const current = activeSubscriptionPrices(source.prices).find((price) => price.territoryId === territoryId);
  const points = source.points.get(territoryId) ?? [];
  const eligible = points.filter((point) => {
    const price = Number(point.attributes.customerPrice);
    if (!Number.isFinite(price) || price <= 0) return false;
    return !current || cap === null || Math.abs(price / Number(current.customerPrice) - 1) * 100 <= cap + 0.000001;
  });
  const snapped = snapToPricePoint(eligible, target);
  if (!snapped) return null;
  const price = Number(snapped.attributes.customerPrice);
  const currentPrice = current?.customerPrice ?? null;
  return {
    currentPrice,
    price: snapped.attributes.customerPrice,
    pointId: snapped.id,
    target,
    changePercent: currentPrice === null ? null : (price / Number(currentPrice) - 1) * 100,
    changed: !current || Math.abs(price - Number(current.customerPrice)) > 0.000001 || source.prices.some((scheduled) => scheduled.territoryId === territoryId && scheduled.startDate && scheduled.startDate > new Date().toISOString().slice(0, 10) && scheduled.pricePointId !== snapped.id),
    staged: currentPrice !== null && cap !== null && Math.abs(target / Number(currentPrice) - 1) * 100 > cap + 0.000001,
  };
}

/** Price the monthly plan first, then resolve yearly against that actual store tier. */
export function buildPlanPricingPreview(monthly: PlanPricingSource, yearly: PlanPricingSource, settings: PlanPricingSettings): PlanPricingRow[] {
  const monthlyAnchor = Number(monthly.anchor.attributes.customerPrice);
  const yearlyAnchor = Number(yearly.anchor.attributes.customerPrice);
  if (![monthlyAnchor, yearlyAnchor].every((price) => Number.isFinite(price) && price > 0)) throw new Error("Choose valid USA prices for both plans.");
  if (monthly.subscriptionId === yearly.subscriptionId) throw new Error("Choose two different subscriptions.");
  if (yearlyAnchor >= monthlyAnchor * 12 && settings.relationship !== "target-discount") throw new Error("The yearly USA price must cost less than 12 monthly payments.");
  if (settings.maxChangePercent !== null && (!Number.isFinite(settings.maxChangePercent) || settings.maxChangePercent < 1 || settings.maxChangePercent > 50)) throw new Error("Choose a movement cap between 1% and 50%.");
  if (settings.relationship === "target-discount" && (!Number.isFinite(settings.annualDiscountPercent) || settings.annualDiscountPercent <= 0 || settings.annualDiscountPercent >= 100)) throw new Error("Choose an annual discount between 0% and 100%, exclusive.");

  const ratio = settings.relationship === "target-discount" ? 12 * (1 - settings.annualDiscountPercent / 100) : yearlyAnchor / monthlyAnchor;
  const targetSavingsPercent = (1 - ratio / 12) * 100;
  const territories = [...new Set([...monthly.baseline.keys(), ...yearly.baseline.keys(), ...monthly.prices.map((price) => price.territoryId), ...yearly.prices.map((price) => price.territoryId)])].sort();
  return territories.map((territoryId) => {
    const m = monthly.baseline.get(territoryId);
    const y = yearly.baseline.get(territoryId);
    const issues: string[] = [];
    const currency = m?.currency || y?.currency || "";
    if (!m || !y) issues.push("One plan has no localized baseline. This country cannot be applied as a pair.");
    if (!currency || (m?.currency && y?.currency && m.currency !== y.currency)) issues.push("The plans' currencies could not be matched.");
    // The reference price is a deliberate user choice, not another regional adjustment.
    const multiplier = territoryId === "USA" ? 1 : pricingPolicyMultiplier(settings.strategy, territoryId);
    const monthlyTarget = m ? Number(m.point.attributes.customerPrice) * multiplier : 0;
    const monthlyCell = m ? resolveCell(monthly, territoryId, monthlyTarget, settings.maxChangePercent) : null;
    const yearlyTarget = settings.relationship === "independent"
      ? (y ? Number(y.point.attributes.customerPrice) * multiplier : 0)
      : (monthlyCell ? Number(monthlyCell.price) * ratio : 0);
    const yearlyCell = y && monthlyCell ? resolveCell(yearly, territoryId, yearlyTarget, settings.maxChangePercent) : null;
    if (!monthlyCell || !yearlyCell) issues.push("No valid price pair fits these settings. Try a larger movement cap or the full target.");
    const savingsPercent = monthlyCell && yearlyCell ? annualSavings(Number(monthlyCell.price), Number(yearlyCell.price)) : null;
    if (savingsPercent !== null && savingsPercent <= 0) issues.push("Yearly is not cheaper than 12 monthly payments. Adjust the anchors or movement cap.");
    return { territoryId, currency, monthly: monthlyCell, yearly: yearlyCell, savingsPercent, targetSavingsPercent, issues };
  });
}
