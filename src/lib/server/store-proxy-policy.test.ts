import { describe, expect, it } from "vitest";
import { isAllowedAscPath } from "./store-proxy-policy";

describe("App Store Connect proxy policy", () => {
  it("allows the v2 IAP reads used by the pricing workspace", () => {
    expect(
      isAllowedAscPath("GET", ["v2", "inAppPurchases", "iap-1", "pricePoints"])
    ).toBe(true);
    expect(
      isAllowedAscPath("GET", [
        "v2",
        "inAppPurchases",
        "iap-1",
        "iapPriceSchedule",
      ])
    ).toBe(true);
  });

  it("does not turn v2 support into an unrestricted write proxy", () => {
    expect(
      isAllowedAscPath("POST", ["v2", "inAppPurchases", "iap-1", "pricePoints"])
    ).toBe(false);
    expect(isAllowedAscPath("GET", ["v3", "anything"])).toBe(false);
  });
});
