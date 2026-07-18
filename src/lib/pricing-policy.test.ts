import { describe, expect, it } from "vitest";
import {
  generateControlledPriceCsv,
  findMovementCapViolations,
  pricingPolicyMultiplier,
  stagePriceTowardTarget,
} from "./pricing-policy";

describe("pricingPolicyMultiplier", () => {
  it("treats Google and Apple country codes as the same market", () => {
    expect(pricingPolicyMultiplier("ppp", "EG")).toBe(
      pricingPolicyMultiplier("ppp", "EGY")
    );
    expect(pricingPolicyMultiplier("growth", "MX")).toBe(
      pricingPolicyMultiplier("growth", "MEX")
    );
    expect(pricingPolicyMultiplier("enterprise", "DE")).toBe(
      pricingPolicyMultiplier("enterprise", "DEU")
    );
  });

  it("covers previously unmapped Google value and mid markets", () => {
    expect(pricingPolicyMultiplier("ppp", "AF")).toBe(0.7);
    expect(pricingPolicyMultiplier("ppp", "AL")).toBe(0.85);
    expect(pricingPolicyMultiplier("ppp", "FR")).toBe(1);
  });
});

describe("bounded movement", () => {
  it("never moves farther than the configured cap", () => {
    expect(stagePriceTowardTarget(100, 10, 25)).toBe(75);
    expect(stagePriceTowardTarget(100, 200, 25)).toBe(125);
  });

  it("generates deterministic CSV without inventing rows", () => {
    const result = generateControlledPriceCsv(
      "territory,currency,price\nEG,EGP,100\nDE,EUR,10",
      { strategy: "ppp", maxChangePercent: 20 }
    );
    expect(result).toBe(
      "territory,currency,price\nEG,EGP,80\nDE,EUR,10"
    );
  });

  it("checks the final store-approved value after rounding", () => {
    const violations = findMovementCapViolations(
      new Map([["EGY", 100], ["DEU", 100]]),
      new Map([["EGY", 111], ["DEU", 109.99]]),
      10
    );
    expect(violations.map((item) => item.territoryId)).toEqual(["EGY"]);
  });
});
