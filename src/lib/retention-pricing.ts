export interface RetentionBaseline { territoryId: string; currency: string; customerPrice: string }
export interface RetentionTier { id: string; price: string }
export interface RetentionPriceRow extends RetentionBaseline {
  target: number; offerPrice: string | null; pricePointId: string | null;
  discountPercent: number | null; warning: string | null;
}
/** Compare against the actual local subscription, never an FX equalization. */
export function buildRetentionPreview(baselines: RetentionBaseline[], tiers: Map<string, RetentionTier[]>, discount: number): RetentionPriceRow[] {
  if (!Number.isFinite(discount) || discount < 5 || discount > 75) throw new Error("Choose a discount between 5% and 75%.");
  const seen = new Set<string>();
  return baselines.map(row => {
    if (seen.has(row.territoryId)) throw new Error(`Duplicate baseline for ${row.territoryId}.`);
    seen.add(row.territoryId);
    const current = Number(row.customerPrice);
    if (!Number.isFinite(current) || current <= 0) throw new Error(`Invalid current price for ${row.territoryId}.`);
    const target = current * (1 - discount / 100);
    const candidates = (tiers.get(row.territoryId) ?? []).filter(t => Number.isFinite(Number(t.price)) && Number(t.price) > 0 && Number(t.price) < current);
    candidates.sort((a, b) => Math.abs(Number(a.price) - target) - Math.abs(Number(b.price) - target) || Number(b.price) - Number(a.price));
    const selected = candidates[0];
    const actual = selected ? (1 - Number(selected.price) / current) * 100 : null;
    return { ...row, target, offerPrice: selected?.price ?? null, pricePointId: selected?.id ?? null, discountPercent: actual,
      warning: actual === null ? "No lower paid price point available" : Math.abs(actual - discount) > 5 ? "Available tier differs from the requested discount by more than 5 points" : null };
  });
}
