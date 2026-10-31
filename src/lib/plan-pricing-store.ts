import type { PlanPricingRow, PlanPricingSettings } from "./plan-pricing";

export type PlanRole = "monthly" | "yearly";
export interface PricingPlan {
  id: string;
  name: string;
  productId: string;
  period: PlanRole;
  groupId?: string;
}
export interface PlanReference { id: string; price: string }
export interface PlanApplyResult {
  subscriptionId: string;
  name: string;
  status: "waiting" | "applying" | "verified" | "failed";
  accepted: number;
  total: number;
  error?: string;
}
export interface PairedPricingPreview {
  rows: PlanPricingRow[];
  settings: PlanPricingSettings;
  apply(input: {
    rows: PlanPricingRow[];
    preserveExistingSubscribers: boolean;
    onResults: (results: PlanApplyResult[]) => void;
  }): Promise<void>;
}
/** Shared interaction contract; store-specific pricing and writes stay in adapters. */
export interface PlanPricingStore {
  platform: "apple" | "google";
  name: string;
  plans: PricingPlan[];
  referenceMode: "tier" | "amount";
  requireMatchingGroup: boolean;
  loadReferences(selected: Record<PlanRole, string>): Promise<Record<PlanRole, { options: PlanReference[]; selectedId: string }>>;
  createPreview(selected: Record<PlanRole, string>, anchors: Record<PlanRole, string>, settings: PlanPricingSettings, onProgress: (message: string) => void): Promise<PairedPricingPreview>;
}
