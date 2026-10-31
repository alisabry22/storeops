import { describe, expect, it } from "vitest";
import { activeSubscriptionPrices, buildPlanPricingPreview, type PlanPricingSettings, type PlanPricingSource } from "./plan-pricing";
import type { SubscriptionPricePoint } from "./asc/types";

function point(id: string, price: number): SubscriptionPricePoint {
  return { type: "subscriptionPricePoints", id, attributes: { customerPrice: String(price), proceeds: String(price) } };
}

function source(id: string, anchor: number, local: number, tiers: number[], current = local): PlanPricingSource {
  const us = point(`${id}-us`, anchor);
  const prices = tiers.map((price) => point(`${id}-${price}`, price));
  return {
    subscriptionId: id, name: id, anchor: us,
    baseline: new Map([["USA", { point: us, currency: "USD" }], ["EGY", { point: point(`${id}-base`, local), currency: "EGP" }]]),
    points: new Map([["USA", [us]], ["EGY", prices]]),
    prices: [{ territoryId: "EGY", currency: "EGP", priceId: `${id}-current`, customerPrice: String(current), pricePointId: `${id}-${current}`, startDate: null }],
  };
}
const full: PlanPricingSettings = { strategy: "ppp", relationship: "reference-discount", annualDiscountPercent: 40, maxChangePercent: null };

describe("linked monthly and yearly pricing", () => {
  it("preserves chosen USA anchors and uses the existing regional policy", () => {
    const monthly = source("monthly", 4.99, 100, [50, 70, 100]);
    const yearly = source("yearly", 29.99, 600, [300, 420, 600]);
    const rows = buildPlanPricingPreview(monthly, yearly, full);
    expect(rows.find((row) => row.territoryId === "USA")?.monthly?.price).toBe("4.99");
    expect(rows.find((row) => row.territoryId === "EGY")?.monthly?.price).toBe("70");
    expect(rows.find((row) => row.territoryId === "EGY")?.yearly?.price).toBe("420");
    const growth = buildPlanPricingPreview(monthly, yearly, { ...full, strategy: "growth" });
    expect(growth.find((row) => row.territoryId === "USA")?.monthly?.price).toBe("4.99");
  });

  it("calculates yearly from the snapped monthly price and reports actual savings", () => {
    const rows = buildPlanPricingPreview(source("m", 5, 100, [79, 100]), source("y", 30, 600, [480, 500, 600]), { ...full, relationship: "target-discount", annualDiscountPercent: 50 });
    const egypt = rows.find((row) => row.territoryId === "EGY")!;
    expect(egypt.monthly?.price).toBe("79");
    expect(egypt.yearly?.target).toBe(474);
    expect(egypt.yearly?.price).toBe("480");
    expect(egypt.savingsPercent).toBeCloseTo((1 - 480 / (79 * 12)) * 100);
    expect(egypt.targetSavingsPercent).toBe(50);
  });

  it("chooses valid tiers inside each movement cap rather than snapping beyond it", () => {
    const rows = buildPlanPricingPreview(source("m", 5, 100, [70, 80, 100]), source("y", 30, 600, [420, 480, 600]), { ...full, maxChangePercent: 10 });
    const egypt = rows.find((row) => row.territoryId === "EGY")!;
    expect(egypt.monthly?.price).toBe("100");
    expect(egypt.yearly?.price).toBe("600");
    expect(egypt.monthly?.staged).toBe(true);
    expect(egypt.monthly?.changed).toBe(false);
  });

  it("marks missing localizations and currency mismatches ineligible", () => {
    const monthly = source("m", 5, 100, [70, 100]);
    const yearly = source("y", 30, 600, [420, 600]);
    yearly.baseline.get("EGY")!.currency = "USD";
    expect(buildPlanPricingPreview(monthly, yearly, full).find((row) => row.territoryId === "EGY")?.issues).toContain("The plans' currencies could not be matched.");
    yearly.baseline.delete("EGY");
    expect(buildPlanPricingPreview(monthly, yearly, full).find((row) => row.territoryId === "EGY")?.issues.length).toBeGreaterThan(0);
    monthly.baseline.delete("EGY");
    expect(buildPlanPricingPreview(monthly, yearly, full).find((row) => row.territoryId === "EGY")?.issues.length).toBeGreaterThan(0);
  });

  it("supports independent annual equalizations and blocks inverted annual value", () => {
    const monthly = source("m", 5, 100, [70, 100]);
    const yearly = source("y", 30, 1000, [700, 1000]);
    const independent = buildPlanPricingPreview(monthly, yearly, { ...full, relationship: "independent" }).find((row) => row.territoryId === "EGY")!;
    expect(independent.yearly?.price).toBe("700");
    yearly.points.set("EGY", [point("expensive", 900)]);
    expect(buildPlanPricingPreview(monthly, yearly, { ...full, relationship: "independent" }).find((row) => row.territoryId === "EGY")?.issues.some((issue) => issue.includes("not cheaper"))).toBe(true);
  });

  it("ignores future prices as current, but replaces a conflicting pending schedule", () => {
    const monthly = source("m", 5, 100, [70, 100]);
    monthly.prices.push({ ...monthly.prices[0], priceId: "future", pricePointId: "future-point", customerPrice: "999", startDate: "2099-01-01" });
    expect(activeSubscriptionPrices(monthly.prices)[0].customerPrice).toBe("100");
    const row = buildPlanPricingPreview(monthly, source("y", 30, 600, [420, 600]), { ...full, strategy: "retention" }).find((row) => row.territoryId === "EGY")!;
    expect(row.monthly?.price).toBe("100");
    expect(row.monthly?.changed).toBe(true);
  });

  it("validates only the discount mode in use", () => {
    const monthly = source("m", 5, 100, [70, 100]);
    const yearly = source("y", 30, 600, [420, 600]);
    expect(() => buildPlanPricingPreview(monthly, yearly, { ...full, annualDiscountPercent: 0 })).not.toThrow();
    expect(() => buildPlanPricingPreview(monthly, yearly, { ...full, relationship: "target-discount", annualDiscountPercent: 0 })).toThrow("Choose an annual discount");
  });
});
