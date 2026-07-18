import { describe, expect, it } from "vitest";
import {
  findPriceMismatches,
  findPricePointMismatches,
  verifyPricePointsWithRetry,
} from "./price-verification";

describe("findPriceMismatches", () => {
  it("accepts a fully verified store response", () => {
    const expected = new Map([["US", 4.99], ["EG", 149.99]]);
    const actual = new Map([["US", 4.99], ["EG", 149.99]]);
    expect(findPriceMismatches(expected, actual)).toEqual([]);
  });

  it("flags missing and changed regions instead of reporting success", () => {
    const expected = new Map([["US", 4.99], ["EG", 149.99]]);
    const actual = new Map([["US", 3.99]]);
    expect(findPriceMismatches(expected, actual)).toEqual([
      { region: "US", expected: 4.99, actual: 3.99 },
      { region: "EG", expected: 149.99, actual: null },
    ]);
  });
});

describe("Apple price-point verification", () => {
  it("reports a missing or different official price point", () => {
    expect(
      findPricePointMismatches(
        new Map([["USA", "point-5"], ["EGY", "point-9"]]),
        new Map([["USA", "point-4"]])
      )
    ).toEqual([
      {
        territoryId: "USA",
        expectedPricePointId: "point-5",
        actualPricePointId: "point-4",
      },
      {
        territoryId: "EGY",
        expectedPricePointId: "point-9",
        actualPricePointId: null,
      },
    ]);
  });

  it("retries while Apple propagates the accepted schedule", async () => {
    let reads = 0;
    const result = await verifyPricePointsWithRetry(
      new Map([["USA", "point-5"]]),
      async () => {
        reads += 1;
        return new Map([["USA", reads === 1 ? "point-4" : "point-5"]]);
      },
      { attempts: 2, delayMs: 0 }
    );
    expect(result).toEqual([]);
    expect(reads).toBe(2);
  });
});
