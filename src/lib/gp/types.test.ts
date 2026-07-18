import { describe, expect, it } from "vitest";
import {
  decimalToMoney,
  GP_NOT_BILLABLE,
  moneyToDecimal,
  requiredCurrency,
} from "./types";

describe("Google Play Money conversion", () => {
  it("preserves sub-cent precision returned by Google", () => {
    expect(
      moneyToDecimal({ currencyCode: "USD", units: "4", nanos: 999_000_000 }),
    ).toBe("4.999");
  });

  it("round-trips a generated price without silently truncating it", () => {
    const price = 32.9891;
    expect(Number(moneyToDecimal(decimalToMoney(price, "EGP")))).toBe(price);
  });

  it("does not hard-code billability across changing regions versions", () => {
    expect(GP_NOT_BILLABLE.size).toBe(0);
  });

  it("never replaces Google's live regional currency with a stale override", () => {
    expect(requiredCurrency("CI", "XOF")).toBe("XOF");
    expect(requiredCurrency("CM", "XAF")).toBe("XAF");
    expect(requiredCurrency("BG", "EUR")).toBe("EUR");
  });
});
