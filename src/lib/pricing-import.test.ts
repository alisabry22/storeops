import { describe, expect, it } from "vitest";
import { parsePriceSheet, snapToPricePoint } from "./pricing-import";

describe("parsePriceSheet", () => {
  it("accepts the explicit financial CSV contract", () => {
    expect(
      parsePriceSheet("territory,currency,price\nUS,USD,4.99\nEG,EGP,149.99", {
        codeLength: 2,
      }).rows
    ).toEqual([
      { territoryId: "US", price: 4.99 },
      { territoryId: "EG", price: 149.99 },
    ]);
  });

  it("rejects symbols and ambiguous numeric text", () => {
    const result = parsePriceSheet(
      "territory,currency,price\nUS,USD,$4.99\nEG,EGP,149EGP",
      { codeLength: 2 }
    );
    expect(result.rows).toEqual([]);
    expect(result.warnings).toHaveLength(2);
  });

  it("rejects a wrong header instead of guessing columns", () => {
    const result = parsePriceSheet("country,value\nUS,4.99", { codeLength: 2 });
    expect(result.rows).toEqual([]);
    expect(result.warnings[0]).toMatch(/Header must include/);
  });
});

describe("snapToPricePoint", () => {
  it("uses the cheaper official tier when two are equally close", () => {
    const points = [
      { id: "high", attributes: { customerPrice: "5.99" } },
      { id: "low", attributes: { customerPrice: "3.99" } },
    ];
    expect(snapToPricePoint(points, 4.99)?.id).toBe("low");
  });
});
