import { beforeEach, describe, expect, it, vi } from "vitest";
import { googlePlanPricingStore, googlePricingPlans } from "./plan-pricing-store";
import { gpFetch } from "./client";
import { decimalToMoney, moneyToDecimal, type GpSubscription } from "./types";
import { takeRequiredSnapshot } from "../snapshots";
import type { PlanPricingSettings } from "../plan-pricing";
import type { PlanApplyResult } from "../plan-pricing-store";

vi.mock("./client", () => ({ gpFetch: vi.fn() }));
vi.mock("../snapshots", () => ({ takeRequiredSnapshot: vi.fn() }));
const settings: PlanPricingSettings = { strategy: "ppp", relationship: "reference-discount", annualDiscountPercent: 40, maxChangePercent: null };
let live: Record<string, GpSubscription>;
let events: string[];
let failedProduct: string;
let ignoreWrite: boolean;
let conversionVersion: string;
let afterPatch: (() => void) | undefined;
const creds = { clientEmail: "qa@example.com" };
const selected = { monthly: "pro:monthly", yearly: "pro:yearly" };
const anchors = { monthly: "4.99", yearly: "29.99" };

beforeEach(() => {
  vi.clearAllMocks(); events = []; failedProduct = ""; ignoreWrite = false; conversionVersion = "2026-01"; afterPatch = undefined;
  live = { pro: { packageName: "com.test", productId: "pro", listings: [{ languageCode: "en-US", title: "Pro" }], basePlans: [
    { basePlanId: "monthly", state: "ACTIVE", autoRenewingBasePlanType: { billingPeriodDuration: "P1M", gracePeriodDuration: "P7D" }, otherRegionsConfig: { newSubscriberAvailability: true }, regionalConfigs: [{ regionCode: "US", price: decimalToMoney(5, "USD"), newSubscriberAvailability: true }, { regionCode: "EG", price: decimalToMoney(100, "EGP"), newSubscriberAvailability: true }] },
    { basePlanId: "yearly", state: "ACTIVE", autoRenewingBasePlanType: { billingPeriodDuration: "P1Y" }, regionalConfigs: [{ regionCode: "US", price: decimalToMoney(30, "USD"), newSubscriberAvailability: true }, { regionCode: "EG", price: decimalToMoney(600, "EGP"), newSubscriberAvailability: true }] },
    { basePlanId: "weekly", state: "ACTIVE", autoRenewingBasePlanType: { billingPeriodDuration: "P1W" }, regionalConfigs: [{ regionCode: "US", price: decimalToMoney(2, "USD") }] },
  ] } };
  vi.mocked(takeRequiredSnapshot).mockImplementation(async (input) => { events.push(`snapshot:${input.scope}`); return { ...input, id: "snapshot", createdAt: "now" }; });
  vi.mocked(gpFetch).mockImplementation(async (_credentials, path, options) => {
    if (path.endsWith("pricing:convertRegionPrices")) {
      const amount = Number(moneyToDecimal((options!.body as { price: ReturnType<typeof decimalToMoney> }).price));
      events.push("convert");
      return { regionVersion: { version: conversionVersion }, convertedRegionPrices: Object.fromEntries([["US", "USD", 1], ["EG", "EGP", 10]].map(([regionCode, currency, rate]) => [regionCode, { regionCode, price: decimalToMoney(Math.round(amount * Number(rate) * 100) / 100, String(currency)) }])) } as never;
    }
    const id = path.split("/").pop()!;
    if (options?.method === "PATCH") {
      events.push(`patch:${id}`);
      if (failedProduct === id) throw new Error("Rejected by Google");
      if (!ignoreWrite) live[id] = structuredClone(options.body as GpSubscription);
      afterPatch?.();
      return {} as never;
    }
    return structuredClone(live[id]) as never;
  });
});
async function preview(selection = selected, config = settings) {
  return googlePlanPricingStore("com.test", creds, Object.values(live)).createPreview(selection, anchors, config, vi.fn());
}
function applyInput(rows: Awaited<ReturnType<typeof preview>>["rows"]) {
  return { rows: rows.filter((row) => !row.issues.length), preserveExistingSubscribers: true, onResults: vi.fn<(results: PlanApplyResult[]) => void>() };
}
function splitProducts() {
  live.annual = { ...structuredClone(live.pro), productId: "annual", basePlans: [live.pro.basePlans![1]] };
  live.pro.basePlans = [live.pro.basePlans![0], live.pro.basePlans![2]];
  return { monthly: selected.monthly, yearly: "annual:yearly" };
}

describe("Google Play paired pricing", () => {
  it("uses declared periods, not plan names, and excludes unsupported periods and installments", () => {
    live.pro.basePlans!.push({ basePlanId: "fake-yearly", autoRenewingBasePlanType: { billingPeriodDuration: "P1W" } }, { basePlanId: "installments", autoRenewingBasePlanType: { billingPeriodDuration: "P1M", installmentDetails: { commitmentPaymentsCount: 12 } } });
    expect(googlePricingPlans(Object.values(live)).map((plan) => plan.id)).toEqual(["pro:monthly", "pro:yearly"]);
  });
  it("starts from the actual live US prices", async () => {
    const references = await googlePlanPricingStore("com.test", creds, Object.values(live)).loadReferences(selected);
    expect(references.monthly.selectedId).toBe("5"); expect(references.yearly.selectedId).toBe("30");
  });
  it("previews official local prices for both plans, links the discount, and writes nothing", async () => {
    const result = await preview();
    const egypt = result.rows.find((row) => row.territoryId === "EG")!;
    expect(egypt.currency).toBe("EGP"); expect(egypt.monthly!.price).toBe("34.93"); expect(Number(egypt.yearly!.price)).toBeCloseTo(209.93, 1);
    expect(egypt.savingsPercent).toBeCloseTo((1 - Number(egypt.yearly!.price) / (12 * 34.93)) * 100);
    expect(egypt.issues).toEqual([]); expect(events.some((event) => event.startsWith("patch:"))).toBe(false);
  });
  it("uses target discounts and independent pricing with the same policy controls", async () => {
    const target = await preview(selected, { ...settings, relationship: "target-discount", annualDiscountPercent: 40 });
    expect(target.rows.find((row) => row.territoryId === "US")!.savingsPercent).toBeCloseTo(40, 1);
    const independent = await preview(selected, { ...settings, relationship: "independent" });
    expect(independent.rows.every((row) => !row.issues.length)).toBe(true);
  });
  it("protects actual final prices after Google rounding", async () => {
    const result = await preview(selected, { ...settings, maxChangePercent: 25 });
    expect(result.rows.every((row) => [row.monthly, row.yearly].every((cell) => Math.abs(cell!.changePercent!) <= 25.000001))).toBe(true);
    expect(result.rows.find((row) => row.territoryId === "EG")!.monthly!.staged).toBe(true);
  });
  it("blocks unavailable countries and currency mismatches, without launching new countries", async () => {
    live.pro.basePlans![1].regionalConfigs![1].newSubscriberAvailability = false;
    const result = await preview();
    expect(result.rows.find((row) => row.territoryId === "EG")!.issues.join()).toContain("unavailable");
    delete live.pro.basePlans![1].regionalConfigs![1].newSubscriberAvailability;
    expect((await preview()).rows.find((row) => row.territoryId === "EG")!.issues.join()).toContain("unavailable");
    live.pro.basePlans![1].regionalConfigs![1].newSubscriberAvailability = true;
    live.pro.basePlans![1].regionalConfigs![1].price!.currencyCode = "USD";
    expect((await preview()).rows.find((row) => row.territoryId === "EG")!.issues.join()).toContain("currencies");
    expect(result.rows.map((row) => row.territoryId)).toEqual(["EG", "US"]);
  });
  it("rejects mixed pricing versions and invalid anchors before any write", async () => {
    const implementation = vi.mocked(gpFetch).getMockImplementation()!;
    let conversions = 0;
    vi.mocked(gpFetch).mockImplementation(async (...args) => { if (args[1].endsWith("pricing:convertRegionPrices")) conversionVersion = String(++conversions); return implementation(...args); });
    await expect(preview()).rejects.toThrow("version changed");
    await expect(googlePlanPricingStore("com.test", creds, Object.values(live)).createPreview(selected, { monthly: "0", yearly: "29" }, settings, vi.fn())).rejects.toThrow("positive");
    expect(events.some((event) => event.startsWith("patch:"))).toBe(false);
  });
  it("saves both full backups before one combined PATCH, preserves siblings, and verifies both", async () => {
    const originalWeekly = structuredClone(live.pro.basePlans![2]);
    const originalOther = structuredClone(live.pro.basePlans![0].otherRegionsConfig);
    const result = await preview(); const input = applyInput(result.rows);
    await result.apply(input);
    expect(events.filter((event) => event !== "convert")).toEqual(["snapshot:gp:sub:pro:monthly", "snapshot:gp:sub:pro:yearly", "patch:pro"]);
    expect(live.pro.basePlans![2]).toEqual(originalWeekly); expect(live.pro.basePlans![0].otherRegionsConfig).toEqual(originalOther);
    expect(input.onResults.mock.lastCall![0].map((plan) => plan.status)).toEqual(["verified", "verified"]);
    const patch = vi.mocked(gpFetch).mock.calls.find((call) => call[2]?.method === "PATCH")!;
    expect(patch[2]!.params).toEqual({ updateMask: "basePlans", "regionsVersion.version": "2026-01" });
    expect(vi.mocked(takeRequiredSnapshot).mock.calls[0][0].rows).toHaveLength(2);
    expect(vi.mocked(gpFetch).mock.calls.some((call) => /migrate|cohort/i.test(call[1]))).toBe(false);
  });
  it("blocks both writes if either required backup fails", async () => {
    const result = await preview();
    vi.mocked(takeRequiredSnapshot).mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(result.apply(applyInput(result.rows))).rejects.toThrow("Storage unavailable");
    expect(events.some((event) => event.startsWith("patch:"))).toBe(false);
  });
  it("blocks stale prices and sibling configuration changes before writes", async () => {
    const result = await preview();
    live.pro.basePlans![2].state = "INACTIVE";
    await expect(result.apply(applyInput(result.rows))).rejects.toThrow("changed since this preview");
    expect(takeRequiredSnapshot).not.toHaveBeenCalled();
  });
  it("reports honest partial results for separate products and never silently reprices a rejected preview", async () => {
    const result = await preview(splitProducts()); const input = applyInput(result.rows);
    failedProduct = "annual";
    const conversionsBefore = events.filter((event) => event === "convert").length;
    await expect(result.apply(input)).rejects.toThrow("Rejected by Google");
    expect(input.onResults.mock.lastCall![0].map((plan) => plan.status)).toEqual(["verified", "failed"]);
    expect(events.filter((event) => event === "convert")).toHaveLength(conversionsBefore);
  });
  it("rechecks the second product after the first is applied", async () => {
    const result = await preview(splitProducts());
    afterPatch = () => { live.annual.basePlans![0].state = "INACTIVE"; };
    await expect(result.apply(applyInput(result.rows))).rejects.toThrow("changed while");
    expect(events.filter((event) => event.startsWith("patch:"))).toEqual(["patch:pro"]);
  });
  it("does not report success or start the next product when read-back differs", async () => {
    const result = await preview(splitProducts()); const input = applyInput(result.rows); ignoreWrite = true;
    await expect(result.apply(input)).rejects.toThrow("could not be verified");
    expect(input.onResults.mock.lastCall![0].map((plan) => plan.status)).toEqual(["failed", "waiting"]);
    expect(events.filter((event) => event.startsWith("patch:"))).toEqual(["patch:pro"]);
  });
  it("normalizes nanosecond carry without creating an invalid Money value", () => {
    expect(decimalToMoney(1.9999999996, "USD")).toEqual({ currencyCode: "USD", units: "2", nanos: 0 });
    expect(moneyToDecimal(decimalToMoney(4.99, "USD"))).toBe("4.99");
  });
});
