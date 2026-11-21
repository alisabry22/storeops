import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_MULTIPLIERS,
  generateControlledPriceCsv,
  findMovementCapViolations,
  marketTierFor,
  marketTierLabel,
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

  it("maps Tier 1 + Gulf, Tier 2 (incl. TR/BR), and Tier 3 PPP consistently across Apple and Google codes", () => {
    expect(marketTierFor("SA")).toBe("tier1_gulf");
    expect(marketTierFor("SAU")).toBe("tier1_gulf");
    expect(marketTierFor("AE")).toBe("tier1_gulf");
    expect(marketTierFor("KWT")).toBe("tier1_gulf");
    expect(marketTierLabel("tier1_gulf")).toBe("Tier 1 · Gulf");

    expect(marketTierFor("TR")).toBe("tier2");
    expect(marketTierFor("TUR")).toBe("tier2");
    expect(marketTierFor("BR")).toBe("tier2");
    expect(marketTierFor("BRA")).toBe("tier2");
    expect(marketTierFor("MX")).toBe("tier2");
    expect(marketTierFor("PL")).toBe("tier2");
    expect(marketTierFor("MY")).toBe("tier2");

    expect(marketTierFor("EG")).toBe("tier3");
    expect(marketTierFor("EGY")).toBe("tier3");
    expect(marketTierFor("IN")).toBe("tier3");
    expect(marketTierFor("ID")).toBe("tier3");
    expect(marketTierFor("PK")).toBe("tier3");
    expect(marketTierFor("NG")).toBe("tier3");

    expect(pricingPolicyMultiplier("tiered", "SAU")).toBe(DEFAULT_TIER_MULTIPLIERS.tier1);
    expect(pricingPolicyMultiplier("tiered", "TUR")).toBe(DEFAULT_TIER_MULTIPLIERS.tier2);
    expect(pricingPolicyMultiplier("tiered", "EGY")).toBe(DEFAULT_TIER_MULTIPLIERS.tier3);

    // Custom tier multipliers are respected and clamped safely
    expect(pricingPolicyMultiplier("tiered", "EGY", { tier3: 0.4 })).toBe(0.4);
    expect(pricingPolicyMultiplier("tiered", "BRA", { tier2: 0.65 })).toBe(0.65);
    expect(pricingPolicyMultiplier("tiered", "EGY", { tier3: 0.01 })).toBe(0.2);
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
