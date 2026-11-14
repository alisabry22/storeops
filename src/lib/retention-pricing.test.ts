import { describe, expect, it } from "vitest";
import { buildRetentionPreview } from "./retention-pricing";
describe("local retention pricing", () => {
  it("uses local prices and refuses tiers at or above the regular price", () => {
    const rows = buildRetentionPreview([{territoryId:"EGY",currency:"EGP",customerPrice:"529"},{territoryId:"USA",currency:"USD",customerPrice:"19.99"}], new Map([["EGY",[{id:"eg",price:"399.99"},{id:"wrong",price:"799.99"}]],["USA",[{id:"us",price:"14.99"}]]]),25);
    expect(rows.map(r=>r.pricePointId)).toEqual(["eg","us"]);
    expect(rows.every(r=>r.warning===null)).toBe(true);
  });
  it("flags unavailable tiers and large rounding deviations", () => {
    const rows=buildRetentionPreview([{territoryId:"A",currency:"USD",customerPrice:"10"},{territoryId:"B",currency:"USD",customerPrice:"10"}],new Map([["A",[{id:"equal",price:"10"}]],["B",[{id:"low",price:"1"}]]]),25);
    expect(rows[0].offerPrice).toBeNull(); expect(rows[1].warning).toBeTruthy();
  });
  it("rejects invalid discounts and duplicate baselines", () => {
    expect(()=>buildRetentionPreview([],new Map(),NaN)).toThrow();
    const row={territoryId:"A",currency:"USD",customerPrice:"10"};
    expect(()=>buildRetentionPreview([row,row],new Map(),25)).toThrow();
  });
});
