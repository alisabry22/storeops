import { beforeEach, describe, expect, it, vi } from "vitest";
import { ascFetch, ascFetchAllFull, AscError } from "./client";
import { takeRequiredSnapshot } from "../snapshots";
import { applyPlanPricing, writeSubscriptionPrices, type PlanApplyResult } from "./subscription-pricing";
import { buildPlanPricingPreview, type PlanPricingSource } from "../plan-pricing";
import type { SubPriceRow, SubscriptionPricePoint } from "./types";

vi.mock("./client", () => ({ ascFetch: vi.fn(), ascFetchAllFull: vi.fn(), AscError: class extends Error { constructor(public status: number, public detail: string) { super(detail); } } }));
vi.mock("../snapshots", () => ({ takeRequiredSnapshot: vi.fn() }));

const credentials = { issuerId: "test-issuer", keyId: "test-key" };
let live: Record<string, SubPriceRow[]>;
let events: string[];

function source(id: string, price: number, next: number): PlanPricingSource {
  const anchor: SubscriptionPricePoint = { id: `${id}-new`, type: "subscriptionPricePoints", attributes: { customerPrice: String(next), proceeds: "0" } };
  return { subscriptionId: id, name: id, anchor, prices: [{ territoryId: "USA", currency: "USD", customerPrice: String(price), priceId: `${id}-old`, pricePointId: `${id}-old-point`, startDate: null }], baseline: new Map([["USA", { point: anchor, currency: "USD" }]]), points: new Map([["USA", [anchor]]]) };
}

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  live = {};
  vi.mocked(takeRequiredSnapshot).mockImplementation(async (input) => { events.push(`snapshot:${input.scope}`); return { ...input, id: "snapshot", createdAt: new Date().toISOString() }; });
  vi.mocked(ascFetchAllFull).mockImplementation(async (_credentials, path) => {
    const id = path.split("/")[3];
    return {
      data: live[id].map((row) => ({ type: "subscriptionPrices", id: row.priceId, attributes: { startDate: row.startDate }, relationships: { territory: { data: { type: "territories", id: row.territoryId } }, subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: row.pricePointId } } } })),
      included: [...live[id].map((row) => ({ type: "subscriptionPricePoints", id: row.pricePointId, attributes: { customerPrice: row.customerPrice, proceeds: "0" } })), { type: "territories", id: "USA", attributes: { currency: "USD" } }],
    } as never;
  });
  vi.mocked(ascFetch).mockImplementation(async (_credentials, _path, options) => {
    const body = options?.body as { data: { attributes: { startDate: string | null }; relationships: { subscription: { data: { id: string } }; subscriptionPricePoint: { data: { id: string } } } } };
    const id = body.data.relationships.subscription.data.id;
    events.push(`write:${id}`);
    live[id].push({ territoryId: "USA", currency: "USD", customerPrice: id === "monthly" ? "4.99" : "29.99", priceId: `${id}-scheduled`, pricePointId: body.data.relationships.subscriptionPricePoint.data.id, startDate: body.data.attributes.startDate });
    return {} as never;
  });
});

function input() {
  const sources: [PlanPricingSource, PlanPricingSource] = [source("monthly", 5.99, 4.99), source("yearly", 39.99, 29.99)];
  live = Object.fromEntries(sources.map((plan) => [plan.subscriptionId, plan.prices.map((price) => ({ ...price }))]));
  return { credentials, appId: "app", sources, rows: buildPlanPricingPreview(...sources, { strategy: "ppp", relationship: "reference-discount", annualDiscountPercent: 40, maxChangePercent: null }), maxChangePercent: null, preserveExistingSubscribers: true, snapshotName: "Before paired apply", onResults: vi.fn() };
}

describe("linked-plan apply safety", () => {
  it("saves both snapshots before any mutation and verifies both plans", async () => {
    const request = input();
    await applyPlanPricing(request);
    expect(events).toEqual(["snapshot:sub:monthly", "snapshot:sub:yearly", "write:monthly", "write:yearly"]);
    expect(request.onResults.mock.lastCall?.[0].map((result: PlanApplyResult) => result.status)).toEqual(["verified", "verified"]);
    expect(vi.mocked(takeRequiredSnapshot).mock.calls[0][0].rows[0].customerPrice).toBe("5.99");
  });

  it("does not write either plan if the second snapshot fails", async () => {
    const request = input();
    const save = vi.mocked(takeRequiredSnapshot).getMockImplementation()!;
    vi.mocked(takeRequiredSnapshot).mockImplementationOnce(save).mockRejectedValueOnce(new Error("Storage is full"));
    await expect(applyPlanPricing(request)).rejects.toThrow("Storage is full");
    expect(takeRequiredSnapshot).toHaveBeenCalledTimes(2);
    expect(ascFetch).not.toHaveBeenCalled();
  });

  it("rejects stale current or upcoming prices before taking snapshots", async () => {
    const request = input();
    live.yearly.push({ ...live.yearly[0], priceId: "new-schedule", startDate: "2099-01-01" });
    await expect(applyPlanPricing(request)).rejects.toThrow("changed in App Store Connect");
    expect(takeRequiredSnapshot).not.toHaveBeenCalled();
    expect(ascFetch).not.toHaveBeenCalled();
  });

  it("checks the final rounded movement cap again before mutation", async () => {
    const request = input();
    await expect(applyPlanPricing({ ...request, maxChangePercent: 1 })).rejects.toThrow("movement cap");
    expect(ascFetch).not.toHaveBeenCalled();
  });

  it("reports an applied monthly plan and failed yearly plan honestly", async () => {
    const request = input();
    const success = vi.mocked(ascFetch).getMockImplementation()!;
    vi.mocked(ascFetch).mockImplementation(async (...args) => {
      if (JSON.stringify(args[2]?.body).includes('"id":"yearly"')) throw new Error("Apple rejected yearly");
      return success(...args);
    });
    await expect(applyPlanPricing(request)).rejects.toThrow("not applied atomically");
    expect(request.onResults.mock.lastCall?.[0].map((result: PlanApplyResult) => result.status)).toEqual(["verified", "failed"]);
    expect(request.onResults.mock.lastCall?.[0][0].accepted).toBe(1);
    expect(request.onResults.mock.lastCall?.[0][1].accepted).toBe(0);
  });

  it("does not overwrite a yearly schedule edited while monthly is being applied", async () => {
    const request = input();
    const success = vi.mocked(ascFetch).getMockImplementation()!;
    vi.mocked(ascFetch).mockImplementation(async (...args) => {
      const result = await success(...args);
      live.yearly.push({ ...live.yearly[0], priceId: "changed-in-another-tab", startDate: "2099-01-01" });
      return result;
    });
    await expect(applyPlanPricing(request)).rejects.toThrow("changed during this run");
    expect(request.onResults.mock.lastCall?.[0].map((result: PlanApplyResult) => result.status)).toEqual(["verified", "failed"]);
    expect(ascFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves existing prices only on increases and schedules after today's price", async () => {
    const original = source("monthly", 3.99, 4.99);
    live.monthly = original.prices;
    await writeSubscriptionPrices(credentials, "monthly", original.prices, [{ territoryId: "USA", pointId: "monthly-new", currentPrice: "3.99", snappedPrice: "4.99" }], true, vi.fn());
    expect(vi.mocked(ascFetch).mock.calls[0][2]?.body).toMatchObject({ data: { attributes: { preserveCurrentPrice: true, startDate: expect.any(String) } } });
  });

  it("cancels future prices, then retries only Apple's explicit minimum-date rejection", async () => {
    const original = source("monthly", 5.99, 4.99);
    original.prices.push({ ...original.prices[0], priceId: "pending", startDate: "2099-01-01" });
    vi.mocked(ascFetch).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new AscError(409, "startDate must be on or after 2099-01-02")).mockResolvedValueOnce({});
    await writeSubscriptionPrices(credentials, "monthly", original.prices, [{ territoryId: "USA", pointId: "monthly-new", currentPrice: "5.99", snappedPrice: "4.99" }], true, vi.fn());
    expect(vi.mocked(ascFetch).mock.calls[0][1]).toBe("/v1/subscriptionPrices/pending");
    expect(vi.mocked(ascFetch).mock.calls[0][2]?.method).toBe("DELETE");
    expect(vi.mocked(ascFetch).mock.calls[2][2]?.body).toMatchObject({ data: { attributes: { startDate: "2099-01-02" } } });
    expect(JSON.stringify(vi.mocked(ascFetch).mock.calls[2][2]?.body)).not.toContain("preserveCurrentPrice");
  });

  it("stops before the second plan when accepted prices cannot be verified", async () => {
    const request = input();
    vi.mocked(ascFetch).mockResolvedValue({});
    await expect(applyPlanPricing(request)).rejects.toThrow("Verification did not match");
    expect(request.onResults.mock.lastCall?.[0].map((result: PlanApplyResult) => result.status)).toEqual(["failed", "waiting"]);
    expect(ascFetch).toHaveBeenCalledTimes(1);
  });
});
