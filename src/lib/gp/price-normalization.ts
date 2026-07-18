import { moneyToDecimal, type GpMoney } from "./types";

export interface GoogleApprovedPricingPreview {
  prices: Record<string, GpMoney>;
  regionsVersion: string;
}

/** Only reuse immutable Google prices when the reviewed decimal still matches. */
export function matchingApprovedRegionalPrices(
  changes: Map<string, number>,
  approved: GoogleApprovedPricingPreview | null,
): Record<string, GpMoney> {
  if (!approved) return {};
  const matches: Record<string, GpMoney> = {};
  for (const [regionCode, money] of Object.entries(approved.prices)) {
    const requested = changes.get(regionCode);
    if (requested === undefined) continue;
    const approvedValue = Number(moneyToDecimal(money));
    if (
      Math.abs(approvedValue - requested) <=
      Math.max(0.000001, requested * 0.000001)
    ) {
      matches[regionCode] = money;
    }
  }
  return matches;
}

export interface RegionalAnchorEstimate {
  regionCode: string;
  targetLocalPrice: number;
  referenceLocalPrice: number;
}

export interface RegionalAnchorGroup {
  anchorUsd: number;
  members: RegionalAnchorEstimate[];
}

function estimatedAnchorUsd(
  referenceAnchorUsd: number,
  item: RegionalAnchorEstimate,
): number {
  return (
    referenceAnchorUsd *
    (item.targetLocalPrice / item.referenceLocalPrice)
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Groups regional targets that originated from approximately the same USD
 * anchor. A single Google convertRegionPrices request then normalizes every
 * member of a group to that market's accepted pricing pattern.
 *
 * The absolute tolerance absorbs low-price rounding noise; the relative
 * tolerance absorbs exchange-rate and local price-pattern noise. Groups are
 * merged to a bounded count so an unusual imported sheet cannot produce an
 * unbounded burst of Google API calls.
 */
export function groupRegionalAnchorEstimates(
  referenceAnchorUsd: number,
  items: RegionalAnchorEstimate[],
  options: {
    relativeTolerance?: number;
    absoluteToleranceUsd?: number;
    maxGroups?: number;
  } = {},
): RegionalAnchorGroup[] {
  const relativeTolerance = options.relativeTolerance ?? 0.035;
  const absoluteToleranceUsd = options.absoluteToleranceUsd ?? 0.2;
  const maxGroups = Math.max(1, options.maxGroups ?? 24);
  const valid = items
    .filter(
      (item) =>
        item.regionCode.length > 0 &&
        Number.isFinite(item.targetLocalPrice) &&
        item.targetLocalPrice > 0 &&
        Number.isFinite(item.referenceLocalPrice) &&
        item.referenceLocalPrice > 0,
    )
    .map((item) => ({
      item,
      estimate: estimatedAnchorUsd(referenceAnchorUsd, item),
    }))
    .filter(({ estimate }) => Number.isFinite(estimate) && estimate > 0)
    .sort((a, b) => a.estimate - b.estimate);

  const groups: Array<{
    anchorUsd: number;
    entries: typeof valid;
  }> = [];

  for (const entry of valid) {
    const current = groups.at(-1);
    const tolerance = current
      ? Math.max(
          absoluteToleranceUsd,
          current.anchorUsd * relativeTolerance,
        )
      : 0;
    if (!current || Math.abs(entry.estimate - current.anchorUsd) > tolerance) {
      groups.push({ anchorUsd: entry.estimate, entries: [entry] });
      continue;
    }
    current.entries.push(entry);
    current.anchorUsd = median(
      current.entries.map((value) => value.estimate),
    );
  }

  while (groups.length > maxGroups) {
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < groups.length - 1; index++) {
      const distance = groups[index + 1].anchorUsd - groups[index].anchorUsd;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    const mergedEntries = [
      ...groups[closestIndex].entries,
      ...groups[closestIndex + 1].entries,
    ];
    groups.splice(closestIndex, 2, {
      anchorUsd: median(mergedEntries.map((value) => value.estimate)),
      entries: mergedEntries,
    });
  }

  return groups.map((group) => ({
    anchorUsd: Math.max(0.05, Math.min(1000, group.anchorUsd)),
    members: group.entries.map(({ item }) => item),
  }));
}
