import { describe, expect, it } from "vitest";
import {
  groupRegionalAnchorEstimates,
  matchingApprovedRegionalPrices,
} from "./price-normalization";

describe("matchingApprovedRegionalPrices", () => {
  it("preserves the exact reviewed Google Money object", () => {
    const idr = { currencyCode: "IDR", units: "379000", nanos: 0 };
    const result = matchingApprovedRegionalPrices(
      new Map([["ID", 379000]]),
      { prices: { ID: idr }, regionsVersion: "2026/01" },
    );

    expect(result.ID).toBe(idr);
  });

  it("does not reuse an approved value after the reviewed price changes", () => {
    const result = matchingApprovedRegionalPrices(
      new Map([["ID", 409000]]),
      {
        prices: {
          ID: { currencyCode: "IDR", units: "379000", nanos: 0 },
        },
        regionsVersion: "2026/01",
      },
    );

    expect(result).toEqual({});
  });
});

describe("groupRegionalAnchorEstimates", () => {
  it("collapses regional rounding noise into shared pricing anchors", () => {
    const groups = groupRegionalAnchorEstimates(30, [
      { regionCode: "US", targetLocalPrice: 30, referenceLocalPrice: 30 },
      { regionCode: "EG", targetLocalPrice: 700, referenceLocalPrice: 1000 },
      { regionCode: "IN", targetLocalPrice: 1050, referenceLocalPrice: 1500 },
      { regionCode: "CY", targetLocalPrice: 25.5, referenceLocalPrice: 30 },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.members.some((m) => m.regionCode === "EG"))?.members)
      .toEqual(expect.arrayContaining([expect.objectContaining({ regionCode: "IN" })]));
  });

  it("bounds API work for an arbitrary imported sheet", () => {
    const groups = groupRegionalAnchorEstimates(
      10,
      Array.from({ length: 50 }, (_, index) => ({
        regionCode: `R${index}`,
        targetLocalPrice: index + 1,
        referenceLocalPrice: 1,
      })),
      { relativeTolerance: 0, absoluteToleranceUsd: 0, maxGroups: 8 },
    );

    expect(groups).toHaveLength(8);
    expect(groups.flatMap((group) => group.members)).toHaveLength(50);
  });

  it("ignores invalid regional targets", () => {
    expect(
      groupRegionalAnchorEstimates(10, [
        { regionCode: "US", targetLocalPrice: 0, referenceLocalPrice: 10 },
        { regionCode: "EG", targetLocalPrice: 50, referenceLocalPrice: 0 },
      ]),
    ).toEqual([]);
  });
});
