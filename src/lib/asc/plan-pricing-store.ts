import type { AscCredentials } from "./jwt";
import type { Subscription } from "./types";
import { applyPlanPricing, fetchSubscriptionPricePoints, loadPlanPricingSource, readSubscriptionPrices } from "./subscription-pricing";
import { activeSubscriptionPrices, buildPlanPricingPreview } from "../plan-pricing";
import { snapToPricePoint } from "../pricing-import";
import type { PlanPricingStore } from "../plan-pricing-store";

export function applePlanPricingStore(appId: string, credentials: AscCredentials, subscriptions: Subscription[], groupIds: Record<string, string>): PlanPricingStore {
  const plans = subscriptions.flatMap((sub) => {
    const period = sub.attributes.subscriptionPeriod === "ONE_MONTH" ? "monthly" : sub.attributes.subscriptionPeriod === "ONE_YEAR" ? "yearly" : null;
    return period ? [{ id: sub.id, name: sub.attributes.name, productId: sub.attributes.productId, period, groupId: groupIds[sub.id] }] : [];
  });
  return {
    platform: "apple", name: "Apple", referenceMode: "tier", requireMatchingGroup: true,
    plans: plans as PlanPricingStore["plans"],
    async loadReferences(selected) {
      const loaded = await Promise.all((["monthly", "yearly"] as const).map(async (role) => {
        const [tiers, prices] = await Promise.all([fetchSubscriptionPricePoints(credentials, selected[role], ["USA"]), readSubscriptionPrices(credentials, selected[role])]);
        const sorted = tiers.filter((point) => Number(point.attributes.customerPrice) > 0).sort((a, b) => Number(a.attributes.customerPrice) - Number(b.attributes.customerPrice));
        if (!sorted.length) throw new Error("This plan has no US prices available. Choose another plan or try again.");
        const current = activeSubscriptionPrices(prices).find((price) => price.territoryId === "USA");
        const preferred = snapToPricePoint(sorted, Number(current?.customerPrice ?? (role === "monthly" ? 4.99 : 29.99)));
        return { options: sorted.map((point) => ({ id: point.id, price: point.attributes.customerPrice })), selectedId: preferred?.id ?? sorted[0].id };
      }));
      return { monthly: loaded[0], yearly: loaded[1] };
    },
    async createPreview(selected, anchors, settings, onProgress) {
      const loaded = await Promise.all((["monthly", "yearly"] as const).map(async (role) => {
        const tiers = await fetchSubscriptionPricePoints(credentials, selected[role], ["USA"]);
        const anchor = tiers.find((point) => point.id === anchors[role]);
        if (!anchor) throw new Error("Choose valid USA prices for both plans.");
        return loadPlanPricingSource(credentials, selected[role], plans.find((plan) => plan.id === selected[role])!.name, anchor, onProgress);
      }));
      const sources: [typeof loaded[number], typeof loaded[number]] = [loaded[0], loaded[1]];
      return { rows: buildPlanPricingPreview(...sources, settings), settings: { ...settings },
        apply: (input) => applyPlanPricing({ ...input, credentials, appId, sources, maxChangePercent: settings.maxChangePercent, snapshotName: "Before pricing plans together" }) };
    },
  };
}
