import type { GpCredentials } from "./auth";
import { gpFetch } from "./client";
import { decimalToMoney, moneyToDecimal, type GpBasePlan, type GpConvertRegionPricesResponse, type GpMoney, type GpSubscription } from "./types";
import { groupRegionalAnchorEstimates } from "./price-normalization";
import { annualSavings, type PlanPriceCell, type PlanPricingRow } from "../plan-pricing";
import type { PairedPricingPreview, PlanApplyResult, PlanPricingStore, PlanRole, PricingPlan } from "../plan-pricing-store";
import { pricingPolicyMultiplier, stagePriceTowardTarget } from "../pricing-policy";
import { takeRequiredSnapshot } from "../snapshots";

const roles = ["monthly", "yearly"] as const;
type GooglePlan = PricingPlan & { basePlanId: string; billingKind: "autoRenewing" | "prepaid" };

/** Billing periods are API metadata, never guesses from a product's name. */
export function googlePricingPlans(subscriptions: GpSubscription[]): GooglePlan[] {
  return subscriptions.filter((sub) => !sub.archived).flatMap((sub) => (sub.basePlans ?? []).flatMap((plan) => {
    if (plan.state === "INACTIVE") return [];
    const billingKind = plan.autoRenewingBasePlanType ? "autoRenewing" : "prepaid";
    const type = (plan.autoRenewingBasePlanType ?? plan.prepaidBasePlanType) as { billingPeriodDuration?: string; installmentDetails?: unknown } | undefined;
    const period = type?.billingPeriodDuration === "P1M" ? "monthly" : type?.billingPeriodDuration === "P1Y" ? "yearly" : null;
    if (!period || type?.installmentDetails) return [];
    return [{ id: `${sub.productId}:${plan.basePlanId}`, productId: sub.productId, basePlanId: plan.basePlanId,
      name: `${sub.listings?.[0]?.title ?? sub.productId} · ${plan.basePlanId}`, period, billingKind }];
  }));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(canonical).sort());
  if (value && typeof value === "object") return JSON.stringify(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, canonical(v)]));
  return JSON.stringify(value);
}
function basePlan(sub: GpSubscription, plan: GooglePlan): GpBasePlan {
  const found = sub.basePlans?.find((item) => item.basePlanId === plan.basePlanId);
  if (!found) throw new Error(`The ${plan.name} base plan is no longer available. Create a new preview.`);
  return found;
}
function positive(price: GpMoney | undefined): price is GpMoney {
  return !!price?.currencyCode && Number.isFinite(Number(moneyToDecimal(price))) && Number(moneyToDecimal(price)) > 0;
}
function movement(current: GpMoney, next: GpMoney): number {
  return (Number(moneyToDecimal(next)) / Number(moneyToDecimal(current)) - 1) * 100;
}

export function googlePlanPricingStore(packageName: string, credentials: GpCredentials, subscriptions: GpSubscription[]): PlanPricingStore {
  const plans = googlePricingPlans(subscriptions);
  const api = `/androidpublisher/v3/applications/${encodeURIComponent(packageName)}`;
  const path = (id: string) => `${api}/subscriptions/${encodeURIComponent(id)}`;
  async function read(selected: Record<PlanRole, string>) {
    const pair = roles.map((role) => plans.find((plan) => plan.id === selected[role]));
    if (!pair[0] || !pair[1] || pair[0].id === pair[1].id) throw new Error("Choose a monthly and a yearly base plan.");
    if (pair[0].billingKind !== pair[1].billingKind) throw new Error("Choose two auto-renewing plans or two prepaid plans, not one of each.");
    const products = new Map(await Promise.all([...new Set(pair.map((plan) => plan!.productId))].map(async (id) => [id, await gpFetch<GpSubscription>(credentials, path(id))] as const)));
    // A stale list must not let a changed billing period through to pricing.
    const available = googlePricingPlans([...products.values()]);
    pair.forEach((plan, index) => {
      if (!available.some((item) => item.id === plan!.id && item.period === roles[index] && item.billingKind === plan!.billingKind)) throw new Error("A base plan's billing period or status changed. Reload the products and choose again.");
    });
    return { pair: pair as [GooglePlan, GooglePlan], products };
  }
  return {
    platform: "google", name: "Google Play", referenceMode: "amount", requireMatchingGroup: false, plans,
    async loadReferences(selected) {
      const { pair, products } = await read(selected);
      const references = pair.map((plan) => {
        const price = basePlan(products.get(plan.productId)!, plan).regionalConfigs?.find((rc) => rc.regionCode === "US")?.price;
        if (!positive(price) || price.currencyCode !== "USD") throw new Error("Set a US dollar price for both base plans in Play Console first.");
        const value = moneyToDecimal(price);
        return { options: [{ id: value, price: value }], selectedId: value };
      });
      return { monthly: references[0], yearly: references[1] };
    },
    async createPreview(selected, anchors, settings, onProgress): Promise<PairedPricingPreview> {
      const monthlyUsd = Number(anchors.monthly);
      const yearlyUsd = settings.relationship === "target-discount" ? monthlyUsd * 12 * (1 - settings.annualDiscountPercent / 100) : Number(anchors.yearly);
      if (![monthlyUsd, yearlyUsd].every((price) => Number.isFinite(price) && price > 0)) throw new Error("Choose positive US prices for both plans.");
      if (yearlyUsd >= monthlyUsd * 12) throw new Error("The yearly US price must cost less than 12 monthly payments.");
      if (settings.relationship === "target-discount" && (!Number.isFinite(settings.annualDiscountPercent) || settings.annualDiscountPercent <= 0 || settings.annualDiscountPercent >= 100)) throw new Error("Choose an annual discount between 1% and 99%.");
      const cap = settings.maxChangePercent;
      if (cap !== null && (!Number.isFinite(cap) || cap < 1 || cap > 50)) throw new Error("Choose a movement cap between 1% and 50%.");
      const { pair, products } = await read(selected);
      const configs = pair.map((plan) => new Map((basePlan(products.get(plan.productId)!, plan).regionalConfigs ?? []).map((rc) => [rc.regionCode, rc])));
      let regionsVersion = "";
      const conversions = new Map<string, Promise<Map<string, GpMoney>>>();
      function convert(usd: number): Promise<Map<string, GpMoney>> {
        const key = String(Math.round(usd * 1e9) / 1e9);
        if (!conversions.has(key)) conversions.set(key, (async () => {
          const response = await gpFetch<GpConvertRegionPricesResponse>(credentials, `${api}/pricing:convertRegionPrices`, { method: "POST", body: { price: decimalToMoney(Number(key), "USD") } });
          const version = response.regionVersion?.version;
          if (!version || (regionsVersion && regionsVersion !== version)) throw new Error("Google's regional pricing version changed or is missing. Create a new preview before applying.");
          regionsVersion = version;
          return new Map(Object.entries(response.convertedRegionPrices ?? {}).flatMap(([region, entry]) => positive(entry.price) ? [[entry.regionCode || region, entry.price]] : []));
        })());
        return conversions.get(key)!;
      }
      onProgress("Loading Google's localized prices for both plans…");
      const baselines = await Promise.all([convert(monthlyUsd), convert(yearlyUsd)]);
      const territories = [...new Set(configs.flatMap((config) => [...config.keys()]))].sort();
      const rows: PlanPricingRow[] = territories.map((territoryId) => {
        const current = configs.map((config) => config.get(territoryId));
        const baseline = baselines.map((grid) => grid.get(territoryId));
        const currency = current[0]?.price?.currencyCode ?? current[1]?.price?.currencyCode ?? "";
        const issues: string[] = [];
        if (current.some((rc) => !positive(rc?.price))) issues.push("Both plans need a current price in this country.");
        // Google defaults an omitted availability flag to false.
        if (current.some((rc) => rc?.newSubscriberAvailability !== true)) issues.push("One plan is unavailable to new buyers here. Enable it in Play Console first.");
        if (baseline.some((price) => !positive(price))) issues.push("Google returned no valid localized price for one plan.");
        if (!currency || [...current.map((rc) => rc?.price), ...baseline].some((price) => price && price.currencyCode !== currency)) issues.push("The plans' current and converted currencies do not match. Review them in Play Console first.");
        return { territoryId, currency, monthly: null, yearly: null, savingsPercent: null, targetSavingsPercent: annualSavings(monthlyUsd, yearlyUsd), issues };
      });
      const approved: [Map<string, GpMoney>, Map<string, GpMoney>] = [new Map(), new Map()];
      const ratio = yearlyUsd / monthlyUsd;
      for (const [index, role] of roles.entries()) {
        const anchor = index === 0 ? monthlyUsd : yearlyUsd;
        const targets = new Map<string, number>();
        const staged = new Map<string, number>();
        for (const row of rows.filter((item) => !item.issues.length)) {
          const baseline = Number(moneyToDecimal(baselines[index].get(row.territoryId)!));
          const target = role === "yearly" && settings.relationship !== "independent"
            ? Number(row.monthly!.price) * ratio
            : baseline * (row.territoryId === "US" ? 1 : pricingPolicyMultiplier(settings.strategy, row.territoryId));
          targets.set(row.territoryId, target);
          const current = Number(moneyToDecimal(configs[index].get(row.territoryId)!.price!));
          staged.set(row.territoryId, cap === null ? target : stagePriceTowardTarget(current, target, cap));
        }
        const groups = groupRegionalAnchorEstimates(anchor, [...staged].filter(([region]) => region !== "US").map(([regionCode, targetLocalPrice]) => ({ regionCode, targetLocalPrice, referenceLocalPrice: Number(moneyToDecimal(baselines[index].get(regionCode)!)) })));
        const normalized = new Map<string, GpMoney>();
        for (const group of groups) {
          onProgress(`Checking ${role} prices against Google's local price patterns…`);
          const grid = await convert(group.anchorUsd);
          for (const item of group.members) { const price = grid.get(item.regionCode); if (price) normalized.set(item.regionCode, price); }
        }
        if (staged.has("US")) { const price = (await convert(staged.get("US")!)).get("US"); if (price) normalized.set("US", price); }
        for (const row of rows.filter((item) => !item.issues.length)) {
          const current = configs[index].get(row.territoryId)!.price!;
          let next = normalized.get(row.territoryId);
          if (!positive(next) || next.currencyCode !== row.currency) { row.issues.push(`Google could not approve the ${role} price in this currency.`); continue; }
          // Never let Google's pattern rounding push a protected price over the cap.
          const capped = cap !== null && Math.abs(movement(current, next)) > cap + 0.000001;
          if (capped) next = current;
          approved[index].set(row.territoryId, structuredClone(next));
          const cell: PlanPriceCell = { currentPrice: moneyToDecimal(current), price: moneyToDecimal(next), pointId: "", target: targets.get(row.territoryId)!, changePercent: movement(current, next), changed: Math.abs(Number(moneyToDecimal(next)) - Number(moneyToDecimal(current))) > 0.000001, staged: capped || Math.abs(staged.get(row.territoryId)! - targets.get(row.territoryId)!) > 0.000001 };
          row[role] = cell;
        }
      }
      for (const row of rows) {
        if (!row.monthly || !row.yearly) { if (!row.issues.length) row.issues.push("No valid price pair is available."); continue; }
        row.savingsPercent = annualSavings(Number(row.monthly.price), Number(row.yearly.price));
        if (row.savingsPercent <= 0) row.issues.push("Yearly is not cheaper than 12 monthly payments. Adjust the US prices or price protection.");
      }
      const capturedSettings = { ...settings };
      return { rows, settings: capturedSettings, async apply(input) {
        const chosen = input.rows;
        if (!chosen.length || chosen.some((row) => row.issues.length || !rows.includes(row))) throw new Error("Create a valid preview before applying.");
        const results: PlanApplyResult[] = pair.map((plan, index) => ({ subscriptionId: plan.id, name: plan.name, status: "waiting", accepted: 0, total: chosen.filter((row) => row[roles[index]]?.changed).length }));
        const emit = () => input.onResults(results.map((result) => ({ ...result })));
        emit();
        const fresh = new Map(await Promise.all([...products.keys()].map(async (id) => [id, await gpFetch<GpSubscription>(credentials, path(id))] as const)));
        for (const [id, original] of products) if (canonical(fresh.get(id)) !== canonical(original)) throw new Error("A Google Play product changed since this preview. Nothing was written. Create a new preview.");
        for (const [index, plan] of pair.entries()) {
          for (const row of chosen) {
            const cell = row[roles[index]]!;
            const price = approved[index].get(row.territoryId);
            const current = configs[index].get(row.territoryId)!.price!;
            if (!price || moneyToDecimal(price) !== cell.price || (cap !== null && Math.abs(movement(current, price)) > cap + 0.000001)) throw new Error("The reviewed prices no longer fit their protection settings. Create a new preview.");
          }
          await takeRequiredSnapshot({ appId: packageName, scope: `gp:sub:${plan.productId}:${plan.basePlanId}`, platform: "googleplay", label: `Before pricing plans together · ${plan.name}`.slice(0, 120), rows: [...configs[index]].flatMap(([territoryId, rc]) => positive(rc.price) ? [{ territoryId, pricePointId: "", customerPrice: moneyToDecimal(rc.price), currency: rc.price.currencyCode }] : []) });
        }
        // One PATCH per product: both base plans in the same subscription must
        // share one fresh payload or the second PATCH could undo the first.
        for (const [id, original] of products) {
          const indexes = pair.flatMap((plan, index) => plan.productId === id ? [index] : []);
          const changing = indexes.filter((index) => results[index].total > 0);
          if (!changing.length) { indexes.forEach((index) => { results[index].status = "verified"; }); emit(); continue; }
          try {
            const live = await gpFetch<GpSubscription>(credentials, path(id));
            if (canonical(live) !== canonical(original)) throw new Error("This product changed while the other plan was being applied. Create a new preview.");
            const updated = structuredClone(live);
            for (const index of indexes) {
              const plan = basePlan(updated, pair[index]);
              plan.regionalConfigs = plan.regionalConfigs?.map((rc) => chosen.some((row) => row.territoryId === rc.regionCode && row[roles[index]]?.changed) ? { ...rc, price: approved[index].get(rc.regionCode)! } : rc);
              results[index].status = "applying";
            }
            emit();
            await gpFetch(credentials, path(id), { method: "PATCH", params: { updateMask: "basePlans", "regionsVersion.version": regionsVersion }, body: updated });
            indexes.forEach((index) => { results[index].accepted = results[index].total; }); emit();
            let verified = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              const actual = await gpFetch<GpSubscription>(credentials, path(id));
              verified = canonical(actual.basePlans) === canonical(updated.basePlans);
              if (verified) break;
              if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
            }
            if (!verified) throw new Error("Google accepted the update, but the saved base plans could not be verified. Check Play Console before retrying.");
            indexes.forEach((index) => { results[index].status = "verified"; }); emit();
          } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            indexes.forEach((index) => { results[index].status = "failed"; results[index].error = message; }); emit();
            throw new Error(message);
          }
        }
      } };
    },
  };
}
