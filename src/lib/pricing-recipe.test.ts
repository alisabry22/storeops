import { describe, expect, it } from "vitest";
import { anchorsFromRecipe, initialPair, isValidRecipe } from "./pricing-recipe";
import type { PricingPlan } from "./plan-pricing-store";

const plan = (id: string, period: "monthly" | "yearly"): PricingPlan => ({ id, name: id, productId: id, period });

describe("initialPair", () => {
  it("auto-selects when there is exactly one monthly and one yearly plan", () => {
    expect(initialPair([plan("m", "monthly"), plan("y", "yearly")], null)).toEqual({ monthly: "m", yearly: "y", sameBenefits: false });
  });

  it("leaves a role empty when there are several choices", () => {
    expect(initialPair([plan("m1", "monthly"), plan("m2", "monthly"), plan("y", "yearly")], null)).toEqual({ monthly: "", yearly: "y", sameBenefits: false });
  });

  it("restores a remembered pair, including its confirmation, while both plans exist", () => {
    const plans = [plan("m1", "monthly"), plan("m2", "monthly"), plan("y", "yearly")];
    expect(initialPair(plans, { monthly: "m2", yearly: "y", sameBenefits: true })).toEqual({ monthly: "m2", yearly: "y", sameBenefits: true });
  });

  it("drops a remembered pair whose plan was removed", () => {
    expect(initialPair([plan("m", "monthly"), plan("y", "yearly")], { monthly: "gone", yearly: "y", sameBenefits: true }))
      .toEqual({ monthly: "m", yearly: "y", sameBenefits: false });
  });
});

describe("anchorsFromRecipe", () => {
  it("uses exact US amounts for amount-based stores", () => {
    expect(anchorsFromRecipe({ monthlyUsd: 9.99, yearlyUsd: 59.99 }, "amount", { monthly: [], yearly: [] }))
      .toEqual({ monthly: "9.99", yearly: "59.99" });
  });

  it("picks the nearest official price point for tier-based stores", () => {
    const points = {
      monthly: [{ id: "a", price: "8.99" }, { id: "b", price: "9.99" }, { id: "c", price: "10.99" }],
      yearly: [{ id: "x", price: "49.99" }, { id: "y", price: "59.99" }],
    };
    expect(anchorsFromRecipe({ monthlyUsd: 9.99, yearlyUsd: 57 }, "tier", points)).toEqual({ monthly: "b", yearly: "y" });
  });

  it("returns null when a tier store has no price points loaded", () => {
    expect(anchorsFromRecipe({ monthlyUsd: 9.99, yearlyUsd: 59.99 }, "tier", { monthly: [], yearly: [] })).toBeNull();
  });
});

describe("isValidRecipe", () => {
  it("rejects malformed or non-positive recipes", () => {
    expect(isValidRecipe(null)).toBe(false);
    expect(isValidRecipe({ monthlyUsd: 0, yearlyUsd: 10, settings: { strategy: "ppp" }, platform: "apple" })).toBe(false);
    expect(isValidRecipe({ monthlyUsd: 1, yearlyUsd: 10, settings: { strategy: "ppp" }, platform: "apple" })).toBe(true);
  });
});
