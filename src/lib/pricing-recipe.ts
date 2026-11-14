/**
 * "Pricing recipe" memory — the choices a developer makes every time they
 * price a monthly + yearly pair: which two plans, the US prices, and the
 * pricing goal. Remembered per app and shared across stores so the same
 * decision is never re-entered on App Store and Google Play.
 *
 * Only *inputs* are remembered. Every reuse still goes through a fresh preview,
 * explicit review, pre-write backups and post-write verification.
 */
import type { PlanPricingSettings } from "./plan-pricing";
import type { PlanReference, PlanRole, PricingPlan } from "./plan-pricing-store";

export interface PricingRecipe {
  monthlyUsd: number;
  yearlyUsd: number;
  settings: PlanPricingSettings;
  platform: "apple" | "google";
  /** App name or package, for the "from …" label. */
  source: string;
  savedAt: string;
}

export interface RememberedPair {
  monthly: string;
  yearly: string;
  sameBenefits: boolean;
}

const RECIPE_KEY = "storeops-pricing-recipe";
const pairKey = (platform: string, scopeId: string) => `storeops-plan-pair:${platform}:${scopeId}`;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full — memory is a convenience, never required.
  }
}

export function isValidRecipe(value: unknown): value is PricingRecipe {
  if (!value || typeof value !== "object") return false;
  const r = value as PricingRecipe;
  return (
    Number.isFinite(r.monthlyUsd) && r.monthlyUsd > 0 &&
    Number.isFinite(r.yearlyUsd) && r.yearlyUsd > 0 &&
    !!r.settings && typeof r.settings.strategy === "string" &&
    (r.platform === "apple" || r.platform === "google")
  );
}

export function loadRecipe(): PricingRecipe | null {
  const value = read<unknown>(RECIPE_KEY);
  return isValidRecipe(value) ? value : null;
}

export function saveRecipe(recipe: PricingRecipe) {
  if (isValidRecipe(recipe)) write(RECIPE_KEY, recipe);
}

export function loadPair(platform: string, scopeId: string | undefined): RememberedPair | null {
  if (!scopeId) return null;
  return read<RememberedPair>(pairKey(platform, scopeId));
}

export function savePair(platform: string, scopeId: string | undefined, pair: RememberedPair) {
  if (scopeId && pair.monthly && pair.yearly) write(pairKey(platform, scopeId), pair);
}

/**
 * Initial plan selection: the remembered pair when both plans still exist,
 * otherwise the only monthly + only yearly plan when there's exactly one of
 * each. `sameBenefits` is only carried over for the exact pair the developer
 * confirmed before.
 */
export function initialPair(plans: PricingPlan[], remembered: RememberedPair | null): RememberedPair {
  const ids = new Set(plans.map((plan) => plan.id));
  if (remembered && ids.has(remembered.monthly) && ids.has(remembered.yearly)) return remembered;
  const monthly = plans.filter((plan) => plan.period === "monthly");
  const yearly = plans.filter((plan) => plan.period === "yearly");
  return {
    monthly: monthly.length === 1 ? monthly[0].id : "",
    yearly: yearly.length === 1 ? yearly[0].id : "",
    sameBenefits: false,
  };
}

/**
 * Map remembered US amounts onto a store's reference inputs: free amounts for
 * Google, the nearest official price point for Apple tiers.
 */
export function anchorsFromRecipe(
  recipe: Pick<PricingRecipe, "monthlyUsd" | "yearlyUsd">,
  mode: "tier" | "amount",
  points: Record<PlanRole, PlanReference[]>,
): Record<PlanRole, string> | null {
  if (mode === "amount") {
    return { monthly: recipe.monthlyUsd.toFixed(2), yearly: recipe.yearlyUsd.toFixed(2) };
  }
  const nearest = (options: PlanReference[], target: number) =>
    options.reduce<PlanReference | undefined>(
      (best, point) => (!best || Math.abs(Number(point.price) - target) < Math.abs(Number(best.price) - target) ? point : best),
      undefined,
    )?.id;
  const monthly = nearest(points.monthly, recipe.monthlyUsd);
  const yearly = nearest(points.yearly, recipe.yearlyUsd);
  return monthly && yearly ? { monthly, yearly } : null;
}
