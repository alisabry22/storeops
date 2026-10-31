import { ascFetch, ascFetchAllFull, AscError } from "./client";
import type { AscCredentials } from "./jwt";
import type { SubPriceRow, SubscriptionPrice, SubscriptionPricePoint, Territory } from "./types";
import { activeSubscriptionPrices, type PlanPricingRow, type PlanPricingSource } from "../plan-pricing";
import { findMovementCapViolations, movementCapErrorMessage } from "../pricing-policy";
import { takeRequiredSnapshot } from "../snapshots";
import { verifyPricePointsWithRetry } from "../price-verification";

export function resolveSubscriptionPrices(prices: SubscriptionPrice[], included: Array<SubscriptionPricePoint | Territory>): SubPriceRow[] {
  const points = new Map(included.filter((item) => item.type === "subscriptionPricePoints").map((item) => [item.id, item as SubscriptionPricePoint]));
  const territories = new Map(included.filter((item) => item.type === "territories").map((item) => [item.id, item as Territory]));
  return prices.flatMap((price) => {
    const pointRef = price.relationships?.subscriptionPricePoint?.data;
    const ref = price.relationships?.territory?.data;
    if (!pointRef || Array.isArray(pointRef) || !ref || Array.isArray(ref)) throw new Error("Apple returned an incomplete subscription price. Refresh before applying.");
    const point = points.get(pointRef.id);
    if (!point) throw new Error(`Apple omitted the price point for ${ref.id}. Refresh before applying.`);
    return [{ territoryId: ref.id, currency: territories.get(ref.id)?.attributes.currency ?? "", customerPrice: point.attributes.customerPrice, priceId: price.id, pricePointId: point.id, startDate: price.attributes.startDate }];
  });
}

export async function readSubscriptionPrices(credentials: AscCredentials, subscriptionId: string): Promise<SubPriceRow[]> {
  const { data, included } = await ascFetchAllFull<SubscriptionPrice, SubscriptionPricePoint | Territory>(credentials, `/v1/subscriptions/${subscriptionId}/prices`, { include: "subscriptionPricePoint,territory" });
  return resolveSubscriptionPrices(data, included);
}

export async function fetchSubscriptionPricePoints(credentials: AscCredentials, subscriptionId: string, territoryIds: string[]): Promise<SubscriptionPricePoint[]> {
  const { data } = await ascFetchAllFull<SubscriptionPricePoint>(credentials, `/v1/subscriptions/${subscriptionId}/pricePoints`, {
    "filter[territory]": territoryIds.join(","),
    "fields[subscriptionPricePoints]": "customerPrice,territory",
    "fields[territories]": "currency", include: "territory", limit: "8000",
  });
  return data;
}

// Like the single-plan workspace, reuse the official catalogue for this session.
// Live prices are always read again; this cache contains only selectable tiers.
const catalogueCache = new Map<string, Map<string, SubscriptionPricePoint[]>>();

export async function loadPlanPricingSource(credentials: AscCredentials, subscriptionId: string, name: string, anchor: SubscriptionPricePoint, onProgress: (message: string) => void): Promise<PlanPricingSource> {
  const [prices, equalizations] = await Promise.all([
    readSubscriptionPrices(credentials, subscriptionId),
    ascFetchAllFull<SubscriptionPricePoint, Territory>(credentials, `/v1/subscriptionPricePoints/${anchor.id}/equalizations`, {
      include: "territory", "fields[subscriptionPricePoints]": "customerPrice,territory", "fields[territories]": "currency", limit: "200",
    }),
  ]);
  const currencies = new Map(equalizations.included.map((territory) => [territory.id, territory.attributes.currency]));
  const baseline: PlanPricingSource["baseline"] = new Map([["USA", { point: anchor, currency: "USD" }]]);
  for (const point of equalizations.data) {
    const ref = point.relationships?.territory?.data;
    if (ref && !Array.isArray(ref) && ref.id !== "USA") baseline.set(ref.id, { point, currency: currencies.get(ref.id) ?? "" });
  }
  const cacheKey = `${credentials.issuerId}:${credentials.keyId}:${subscriptionId}`;
  const points = catalogueCache.get(cacheKey) ?? new Map<string, SubscriptionPricePoint[]>();
  catalogueCache.set(cacheKey, points);
  const territories = [...baseline.keys()];
  for (let index = 0; index < territories.length; index += 20) {
    const batch = territories.slice(index, index + 20).filter((territoryId) => !points.get(territoryId)?.length);
    let returned: SubscriptionPricePoint[] = [];
    try {
      if (batch.length) returned = await fetchSubscriptionPricePoints(credentials, subscriptionId, batch);
    } catch (error) {
      if (!(error instanceof AscError) || error.status !== 400 || batch.length === 1) throw error;
    }
    for (const point of returned) {
      const ref = point.relationships?.territory?.data;
      if (ref && !Array.isArray(ref) && batch.includes(ref.id)) points.set(ref.id, [...(points.get(ref.id) ?? []), point]);
    }
    for (const territoryId of batch) {
      // Match the existing single-plan workspace's fallback for older ASC array filters.
      if (!points.get(territoryId)?.length) points.set(territoryId, await fetchSubscriptionPricePoints(credentials, subscriptionId, [territoryId]));
    }
    onProgress(`${name}: checked ${Math.min(index + 20, territories.length)} of ${territories.length} countries`);
  }
  return { subscriptionId, name, prices, anchor, baseline, points };
}

export interface SubscriptionPriceWrite {
  territoryId: string;
  pointId: string;
  currentPrice: string | null;
  snappedPrice: string;
}

/** Shared by single-plan imports, restores, and linked-plan applies. */
export async function writeSubscriptionPrices(credentials: AscCredentials, subscriptionId: string, currentPrices: SubPriceRow[], rows: SubscriptionPriceWrite[], preserveExistingSubscribers: boolean, onProgress: (done: number) => void): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  let done = 0;
  for (let index = 0; index < rows.length; index += 4) {
    const batch = rows.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map(async (row) => {
      const existing = currentPrices.filter((price) => price.territoryId === row.territoryId);
      let hasCurrent = existing.some((price) => !price.startDate || price.startDate <= today);
      for (const price of existing) {
        if (!price.startDate || price.startDate <= today) continue;
        try {
          await ascFetch(credentials, `/v1/subscriptionPrices/${price.priceId}`, { method: "DELETE" });
        } catch (error) {
          if (error instanceof AscError && error.status === 409) hasCurrent = true;
          else throw error;
        }
      }
      const startDate = hasCurrent ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) : null;
      const isIncrease = row.currentPrice !== null && Number(row.snappedPrice) > Number(row.currentPrice);
      const body = (date: string | null) => ({ data: {
        type: "subscriptionPrices",
        attributes: { startDate: date, ...(isIncrease ? { preserveCurrentPrice: preserveExistingSubscribers } : {}) },
        relationships: {
          subscription: { data: { type: "subscriptions", id: subscriptionId } },
          subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: row.pointId } },
          territory: { data: { type: "territories", id: row.territoryId } },
        },
      } });
      try {
        await ascFetch(credentials, "/v1/subscriptionPrices", { method: "POST", body: body(startDate) });
      } catch (error) {
        const minimum = error instanceof AscError && error.status === 409 && startDate !== null ? error.detail.match(/on or after (\d{4}-\d{2}-\d{2})/)?.[1] : null;
        if (!minimum) throw error;
        await ascFetch(credentials, "/v1/subscriptionPrices", { method: "POST", body: body(minimum) });
      }
      onProgress(++done);
    }));
    const failures = results.flatMap((result, i) => result.status === "rejected" ? [`${batch[i].territoryId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`] : []);
    if (failures.length) throw new Error(`Stopped after ${done} accepted price changes. Some changes may already be scheduled: ${failures.join(" · ")}`);
  }
}

function priceFingerprint(prices: SubPriceRow[]): string {
  return JSON.stringify([...prices].sort((a, b) => a.priceId.localeCompare(b.priceId)));
}

import type { PlanApplyResult } from "../plan-pricing-store";
export type { PlanApplyResult } from "../plan-pricing-store";

export async function applyPlanPricing(input: {
  credentials: AscCredentials;
  appId: string;
  sources: [PlanPricingSource, PlanPricingSource];
  rows: PlanPricingRow[];
  maxChangePercent: number | null;
  preserveExistingSubscribers: boolean;
  snapshotName: string;
  onResults: (results: PlanApplyResult[]) => void;
}): Promise<void> {
  const { sources, rows } = input;
  if (!rows.length || rows.some((row) => row.issues.length || !row.monthly || !row.yearly)) throw new Error("Select countries with valid prices for both plans.");
  const results: PlanApplyResult[] = sources.map((source, i) => ({ subscriptionId: source.subscriptionId, name: source.name, status: "waiting", accepted: 0, total: rows.filter((row) => (i === 0 ? row.monthly : row.yearly)?.changed).length }));
  const report = () => input.onResults(results.map((result) => ({ ...result })));
  report();
  // Complete both preflights and both restore points before the very first mutation.
  const fresh = await Promise.all(sources.map((source) => readSubscriptionPrices(input.credentials, source.subscriptionId)));
  for (let i = 0; i < sources.length; i++) {
    if (priceFingerprint(fresh[i]) !== priceFingerprint(sources[i].prices)) throw new Error(`${sources[i].name} changed in App Store Connect after this preview. Generate a fresh preview before applying either plan.`);
    if (input.maxChangePercent !== null) {
      const violations = findMovementCapViolations(new Map(activeSubscriptionPrices(fresh[i]).map((price) => [price.territoryId, Number(price.customerPrice)])), new Map(rows.map((row) => [row.territoryId, Number((i === 0 ? row.monthly : row.yearly)!.price)])), input.maxChangePercent);
      if (violations.length) throw new Error(movementCapErrorMessage(violations, input.maxChangePercent));
    }
  }
  for (let i = 0; i < sources.length; i++) {
    await takeRequiredSnapshot({ appId: input.appId, scope: `sub:${sources[i].subscriptionId}`, label: `${input.snapshotName} · ${sources[i].name}`.slice(0, 120), rows: activeSubscriptionPrices(fresh[i]).map((price) => ({ territoryId: price.territoryId, pricePointId: price.pricePointId, customerPrice: price.customerPrice, currency: price.currency })) });
  }
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const writes = rows.flatMap((row) => {
      const cell = (i === 0 ? row.monthly : row.yearly)!;
      return cell.changed ? [{ territoryId: row.territoryId, pointId: cell.pointId, currentPrice: cell.currentPrice, snappedPrice: cell.price }] : [];
    });
    try {
      // A worldwide first-plan apply can take minutes. Do not overwrite a
      // second-plan schedule edited elsewhere during that interval.
      const beforeWrite = await readSubscriptionPrices(input.credentials, source.subscriptionId);
      if (priceFingerprint(beforeWrite) !== priceFingerprint(fresh[i])) throw new Error("Prices changed during this run. Generate a fresh preview before continuing.");
      results[i].status = "applying";
      report();
      await writeSubscriptionPrices(input.credentials, source.subscriptionId, fresh[i], writes, input.preserveExistingSubscribers, (done) => { results[i].accepted = done; report(); });
      const expected = new Map(rows.map((row) => [row.territoryId, (i === 0 ? row.monthly : row.yearly)!.pointId]));
      const mismatches = await verifyPricePointsWithRetry(expected, async () => {
        const live = await readSubscriptionPrices(input.credentials, source.subscriptionId);
        // Compare the latest scheduled price as well as effective prices.
        const latest = new Map<string, SubPriceRow>();
        for (const price of live) {
          if (!latest.has(price.territoryId) || (price.startDate ?? "") >= (latest.get(price.territoryId)!.startDate ?? "")) latest.set(price.territoryId, price);
        }
        return new Map([...latest].map(([territory, price]) => [territory, price.pricePointId]));
      });
      if (mismatches.length) throw new Error(`Verification did not match for ${mismatches.slice(0, 6).map((row) => row.territoryId).join(", ")}. Review current and upcoming prices before retrying.`);
      results[i].status = "verified";
      report();
    } catch (error) {
      results[i].status = "failed";
      results[i].error = error instanceof Error ? error.message : String(error);
      report();
      throw new Error(`${source.name}: ${results[i].error} The two plans are not applied atomically. Generate a fresh preview before retrying.`);
    }
  }
}
