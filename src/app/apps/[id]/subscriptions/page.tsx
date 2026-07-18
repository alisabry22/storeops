"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch, ascFetchAllFull, AscError } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
import { PaywallModal, estimateManualMinutes } from "@/components/Paywall";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { TopBar } from "@/components/TopBar";
import { useIsPro } from "@/lib/license";
import { useHydrated } from "@/lib/use-hydrated";
import {
  takeRequiredSnapshot,
  takeSnapshot,
  type PriceSnapshot,
} from "@/lib/snapshots";
import { buildCsv, parsePriceSheet, snapToPricePoint } from "@/lib/pricing-import";
import { STRATEGIES, type PricingStrategy } from "@/lib/pricing-strategies";
import {
  findMovementCapViolations,
  movementCapErrorMessage,
  pricingPolicyMultiplier,
  stagePriceTowardTarget,
} from "@/lib/pricing-policy";
import { AiRepricePanel } from "@/components/AiRepricePanel";
import { SnapshotConfirmDialog } from "@/components/SnapshotConfirmDialog";
import { ApplySuccessDialog } from "@/components/ApplySuccessDialog";
import { verifyPricePointsWithRetry } from "@/lib/price-verification";
import type {
  Subscription,
  SubscriptionGroup,
  SubscriptionPrice,
  SubscriptionPricePoint,
  SubPriceRow,
  Territory,
} from "@/lib/asc/types";
import { formatPeriod } from "@/lib/asc/types";

interface SubImportRow {
  territoryId: string;
  currency: string;
  currentPrice: string | null;
  requested: number;
  snappedPrice: string;
  pointId: string;
  note: string | null;
  changePercent: number | null;
  direction: "increase" | "decrease" | "unchanged" | "new";
}

// Partial, session-scoped catalogue. Entries are added only for territories
// whose requested price changed; Apple recommends filtering this endpoint by
// territory and plans to require that filter.
const allPointsCache = new Map<string, Map<string, SubscriptionPricePoint[]>>();
const PRICE_POINT_TERRITORY_BATCH = 20;

function formatPrice(price: string, currency: string): string {
  const n = Number(price);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
  } catch {
    return `${price} ${currency}`;
  }
}

function resolvePrices(
  prices: SubscriptionPrice[],
  included: Array<SubscriptionPricePoint | Territory>
): SubPriceRow[] {
  const points = new Map<string, SubscriptionPricePoint>();
  const territories = new Map<string, Territory>();
  for (const inc of included) {
    if (inc.type === "subscriptionPricePoints") points.set(inc.id, inc as SubscriptionPricePoint);
    if (inc.type === "territories") territories.set(inc.id, inc as Territory);
  }
  const rows: SubPriceRow[] = [];
  for (const price of prices) {
    const pointRef = price.relationships?.subscriptionPricePoint?.data;
    const terrRef = price.relationships?.territory?.data;
    if (!pointRef || Array.isArray(pointRef) || !terrRef || Array.isArray(terrRef)) continue;
    const point = points.get(pointRef.id);
    const territory = territories.get(terrRef.id);
    if (!point) continue;
    rows.push({
      territoryId: terrRef.id,
      currency: territory?.attributes.currency ?? "",
      customerPrice: point.attributes.customerPrice,
      priceId: price.id,
      pricePointId: point.id,
      startDate: price.attributes.startDate,
    });
  }
  return rows;
}

export default function SubscriptionsPage() {
  const { id } = useParams<{ id: string }>();
  const { credentials } = useCredentials();

  const hydrated = useHydrated();
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [error, setError] = useState("");

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSubId, setSelectedSubId] = useState("");
  const [currentPrices, setCurrentPrices] = useState<SubPriceRow[]>([]);
  const [territoriesMap, setTerritoriesMap] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");

  // Import flow
  const [sheetText, setSheetText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<SubImportRow[] | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState(false);
  const [applySummary, setApplySummary] = useState<{
    productLabel: string;
    regionsChanged: number;
    warnings: string[];
    verified: boolean;
  } | null>(null);
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [strategy, setStrategy] = useState<PricingStrategy>("ppp");
  const [pricingMode, setPricingMode] = useState<"anchor" | "adjust">("anchor");
  const [anchorPoints, setAnchorPoints] = useState<SubscriptionPricePoint[]>([]);
  const [selectedAnchorPointId, setSelectedAnchorPointId] = useState("");
  const [anchorMaxChangePercent, setAnchorMaxChangePercent] = useState(25);
  const [applyFullAnchorTarget, setApplyFullAnchorTarget] = useState(false);
  const [previewMovementCap, setPreviewMovementCap] = useState<number | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [preserveExistingSubscribers, setPreserveExistingSubscribers] = useState(true);
  const [acknowledgedImpact, setAcknowledgedImpact] = useState(false);

  // Pro gate + snapshots
  const isPro = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [snapRefresh, setSnapRefresh] = useState(0);

  useEffect(() => {
    if (!credentials || !hydrated) return;
    ascFetchAllFull<Territory>(credentials, "/v1/territories")
      .then(({ data }) =>
        setTerritoriesMap(new Map(data.map((t) => [t.id, t.attributes.currency])))
      )
      .catch(() => {});
  }, [credentials, hydrated]);

  // Load all subscription groups + subscriptions
  useEffect(() => {
    if (!credentials || !hydrated) return;
    queueMicrotask(() => void (async () => {
      setLoadingGroups(true);
      setError("");
      try {
        const { data: groups } = await ascFetchAllFull<SubscriptionGroup>(
          credentials,
          `/v1/apps/${id}/subscriptionGroups`
        );

        const allSubs: Subscription[] = [];
        await Promise.all(
          groups.map(async (g) => {
            const { data: subs } = await ascFetchAllFull<Subscription>(
              credentials,
              `/v1/subscriptionGroups/${g.id}/subscriptions`
            );
            allSubs.push(...subs);
          })
        );

        allSubs.sort((a, b) => a.attributes.name.localeCompare(b.attributes.name));
        setSubscriptions(allSubs);
        if (allSubs.length === 1) setSelectedSubId(allSubs[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingGroups(false);
      }
    })());
  }, [credentials, hydrated, id]);

  const loadPrices = useCallback(async (subId: string) => {
    if (!credentials || !subId) return;
    setLoadingPrices(true);
    setError("");
    setCurrentPrices([]);
    try {
      const { data, included } = await ascFetchAllFull<
        SubscriptionPrice,
        SubscriptionPricePoint | Territory
      >(credentials, `/v1/subscriptions/${subId}/prices`, {
        include: "subscriptionPricePoint,territory",
      });
      const rows = resolvePrices(data, included).sort((a, b) =>
        a.territoryId.localeCompare(b.territoryId)
      );
      setCurrentPrices(rows);
      return rows;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoadingPrices(false);
    }
  }, [credentials]);

  async function verifySubscriptionPricePoints(
    expected: ReadonlyMap<string, string>
  ) {
    const mismatches = await verifyPricePointsWithRetry(expected, async () => {
      const rows = await loadPrices(selectedSubId);
      if (!rows) return null;
      const latest = new Map<
        string,
        { pointId: string; startDate: string }
      >();
      for (const row of rows) {
        const candidateDate = row.startDate ?? "";
        const existing = latest.get(row.territoryId);
        if (!existing || candidateDate >= existing.startDate) {
          latest.set(row.territoryId, {
            pointId: row.pricePointId,
            startDate: candidateDate,
          });
        }
      }
      return new Map(
        [...latest].map(([territoryId, value]) => [
          territoryId,
          value.pointId,
        ])
      );
    });
    if (mismatches.length > 0) {
      throw new Error(
        `Apple accepted one or more subscription changes, but live verification did not match for ${mismatches
          .slice(0, 6)
          .map((item) => item.territoryId)
          .join(", ")}${mismatches.length > 6 ? "…" : ""}. Refresh and review current and upcoming prices before retrying.`
      );
    }
  }

  useEffect(() => {
    if (selectedSubId) {
      queueMicrotask(() => {
        setAnchorPoints([]);
        setSelectedAnchorPointId("");
        setImportPreview(null);
        setSheetText("");
        setPreviewMovementCap(null);
        setApplied(false);
        setApplySummary(null);
        void loadPrices(selectedSubId);
      });
    }
  }, [selectedSubId, loadPrices]);

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  // Split all price rows into active (startDate <= today or null) vs upcoming (startDate > today)
  const { activePrices, upcomingPrices } = useMemo(() => {
    const active: SubPriceRow[] = [];
    const upcoming: SubPriceRow[] = [];
    for (const r of currentPrices) {
      if (r.startDate && r.startDate > today) {
        upcoming.push(r);
      } else {
        active.push(r);
      }
    }
    // For active: per territory keep the one with the latest startDate
    const byTerritory = new Map<string, SubPriceRow>();
    for (const r of active) {
      const existing = byTerritory.get(r.territoryId);
      if (!existing || (r.startDate ?? "") > (existing.startDate ?? "")) {
        byTerritory.set(r.territoryId, r);
      }
    }
    return {
      activePrices: [...byTerritory.values()].sort((a, b) => a.territoryId.localeCompare(b.territoryId)),
      upcomingPrices: upcoming.sort((a, b) => a.territoryId.localeCompare(b.territoryId)),
    };
  }, [currentPrices, today]);

  // currentByTerritory indexes active prices only — used for DELETE on apply
  const currentByTerritory = useMemo(() => {
    const m = new Map<string, SubPriceRow[]>();
    for (const r of currentPrices) {
      const arr = m.get(r.territoryId) ?? [];
      arr.push(r);
      m.set(r.territoryId, arr);
    }
    return m;
  }, [currentPrices]);

  const previewImpact = useMemo(() => {
    const rows = importPreview ?? [];
    return {
      increases: rows.filter((row) => row.direction === "increase").length,
      decreases: rows.filter((row) => row.direction === "decrease").length,
      highRisk: rows.filter((row) => row.changePercent !== null && Math.abs(row.changePercent) > 25).length,
    };
  }, [importPreview]);

  function pricePointCacheKey(): string {
    return `${credentials?.issuerId ?? "unknown"}:${selectedSubId}`;
  }

  function addPricePointsToCache(
    cache: Map<string, SubscriptionPricePoint[]>,
    points: SubscriptionPricePoint[]
  ) {
    for (const point of points) {
      const territoryRef = point.relationships?.territory?.data;
      if (!territoryRef || Array.isArray(territoryRef)) continue;
      const existing = cache.get(territoryRef.id) ?? [];
      existing.push(point);
      cache.set(territoryRef.id, existing);
    }
  }

  async function fetchPricePointTerritories(
    territoryIds: string[]
  ): Promise<SubscriptionPricePoint[]> {
    const { data } = await ascFetchAllFull<SubscriptionPricePoint>(
      credentials!,
      `/v1/subscriptions/${selectedSubId}/pricePoints`,
      {
        "filter[territory]": territoryIds.join(","),
        "fields[subscriptionPricePoints]": "customerPrice,territory",
        "fields[territories]": "currency",
        include: "territory",
        limit: "8000",
      }
    );
    return data;
  }

  /** Load only missing territories. Multi-value filter falls back to single territory requests. */
  async function loadPricePointsForTerritories(
    requestedTerritories: string[],
    onProgress: (done: number, total: number) => void
  ): Promise<Map<string, SubscriptionPricePoint[]>> {
    const cacheKey = pricePointCacheKey();
    const cached = allPointsCache.get(cacheKey) ?? new Map<string, SubscriptionPricePoint[]>();
    allPointsCache.set(cacheKey, cached);
    const unique = [...new Set(requestedTerritories)];
    // Empty entries can be left by an interrupted/older preview. Treat them as
    // misses so a refresh heals the cache instead of repeating "no points".
    const missing = unique.filter((territoryId) => (cached.get(territoryId)?.length ?? 0) === 0);
    let done = unique.length - missing.length;
    onProgress(done, unique.length);

    for (let index = 0; index < missing.length; index += PRICE_POINT_TERRITORY_BATCH) {
      const batch = missing.slice(index, index + PRICE_POINT_TERRITORY_BATCH);
      try {
        const batchPoints = await fetchPricePointTerritories(batch);
        addPricePointsToCache(cached, batchPoints);
        const returnedTerritories = new Set(
          batchPoints.flatMap((point) => {
            const ref = point.relationships?.territory?.data;
            return ref && !Array.isArray(ref) ? [ref.id] : [];
          })
        );
        // A successful response that silently ignores part of a multi-value
        // filter is treated like an old ASC implementation: fill only those
        // missing territories with single-filter requests.
        for (const territoryId of batch.filter((id) => !returnedTerritories.has(id))) {
          const territoryPoints = await fetchPricePointTerritories([territoryId]);
          // A single-territory filtered response is unambiguous even if an
          // older ASC response omits relationship linkage.
          cached.set(territoryId, territoryPoints);
        }
        done += batch.length;
        onProgress(done, unique.length);
      } catch (error) {
        // Some ASC deployments have historically handled array filters
        // inconsistently. Preserve compatibility by retrying this batch one
        // territory at a time, never by downloading the global catalogue.
        if (!(error instanceof AscError) || error.status !== 400 || batch.length === 1) throw error;
        for (const territoryId of batch) {
          const territoryPoints = await fetchPricePointTerritories([territoryId]);
          cached.set(territoryId, territoryPoints);
          done += 1;
          onProgress(done, unique.length);
        }
      }
    }
    return cached;
  }

  async function loadUsAnchorPoints() {
    if (!credentials || !selectedSubId) return;
    setAnchorLoading(true);
    setError("");
    try {
      const points = await fetchPricePointTerritories(["USA"]);
      const sorted = [...points].sort(
        (left, right) => Number(left.attributes.customerPrice) - Number(right.attributes.customerPrice)
      );
      setAnchorPoints(sorted);
      const preferred = sorted.find((point) => Number(point.attributes.customerPrice) === 29.99);
      setSelectedAnchorPointId(preferred?.id ?? sorted[0]?.id ?? "");
      if (sorted.length === 0) setError("Apple returned no USA anchor price points for this subscription.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setAnchorLoading(false);
    }
  }

  async function generateAnchorPreview() {
    if (!credentials || !selectedAnchorPointId) return;
    setAnchorLoading(true);
    setError("");
    try {
      const selectedPoint = anchorPoints.find((point) => point.id === selectedAnchorPointId);
      if (!selectedPoint) throw new Error("Choose a valid USA anchor price.");
      const { data: equalized, included } = await ascFetchAllFull<
        SubscriptionPricePoint,
        Territory
      >(credentials, `/v1/subscriptionPricePoints/${selectedAnchorPointId}/equalizations`, {
        include: "territory",
        "fields[subscriptionPricePoints]": "customerPrice,territory",
        "fields[territories]": "currency",
        limit: "200",
      });
      const currencyByTerritory = new Map(territoriesMap);
      for (const territory of included) {
        if (territory.type === "territories") currencyByTerritory.set(territory.id, territory.attributes.currency);
      }
      const baselinePoints: Array<{ territoryId: string; point: SubscriptionPricePoint }> = [
        { territoryId: "USA", point: selectedPoint },
      ];
      for (const point of equalized) {
        const ref = point.relationships?.territory?.data;
        if (ref && !Array.isArray(ref) && ref.id !== "USA") baselinePoints.push({ territoryId: ref.id, point });
      }

      const currentByTerritory = new Map(activePrices.map((price) => [price.territoryId, Number(price.customerPrice)]));
      const finalTargets = new Map<string, number>();
      const csvRows = baselinePoints.map(({ territoryId, point }) => {
        const equalizedPrice = Number(point.attributes.customerPrice);
        const finalTarget = equalizedPrice * pricingPolicyMultiplier(strategy, territoryId);
        const currentPrice = currentByTerritory.get(territoryId) ?? null;
        const stagedTarget = applyFullAnchorTarget
          ? finalTarget
          : stagePriceTowardTarget(currentPrice, finalTarget, anchorMaxChangePercent);
        finalTargets.set(territoryId, finalTarget);
        return {
          territoryId,
          currency: currencyByTerritory.get(territoryId) ?? (territoryId === "USA" ? "USD" : ""),
          customerPrice: String(Math.round(stagedTarget * 10_000) / 10_000),
        };
      });
      const csv = buildCsv(csvRows);
      setPreviewMovementCap(
        applyFullAnchorTarget ? null : anchorMaxChangePercent
      );
      setSheetText(csv);
      await buildImportPreview(csv, finalTargets);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError));
    } finally {
      setAnchorLoading(false);
    }
  }

  async function buildImportPreview(
    csvOverride?: string,
    finalPolicyTargets?: Map<string, number>
  ) {
    const _text = csvOverride ?? sheetText;
    if (!credentials || !_text.trim() || !selectedSubId) return;
    setError("");
    setApplied(false);
    setApplySummary(null);
    setImportPreview(null);
    setAcknowledgedImpact(false);

    const { rows, warnings } = parsePriceSheet(_text);
    const allWarnings = [...warnings];

    const valid = rows.filter((r) => {
      if (territoriesMap.size > 0 && !territoriesMap.has(r.territoryId)) {
        allWarnings.push(`${r.territoryId}: not an App Store territory — skipped`);
        return false;
      }
      return true;
    });

    setImportWarnings(allWarnings);
    if (valid.length === 0) {
      setError("No usable rows. Expected CSV: territory,price (3-letter codes like USA, EGY).");
      return;
    }

    const activeByTerritory = new Map(activePrices.map((price) => [price.territoryId, Number(price.customerPrice)]));
    const changed = valid.filter((row) => {
      const current = activeByTerritory.get(row.territoryId);
      return current === undefined || Math.abs(current - row.price) > 0.000001;
    });
    if (changed.length === 0) {
      setImportWarnings(allWarnings);
      setError("No price changes to preview. Every requested price already matches the active price.");
      return;
    }

    setImportProgress({ done: 0, total: changed.length });
    try {
      const pointsByTerritory = await loadPricePointsForTerritories(
        changed.map((row) => row.territoryId),
        (done, total) => setImportProgress({ done, total })
      );

      const resolved = changed.map((row) => {
        const points = pointsByTerritory.get(row.territoryId);
        if (!points || points.length === 0) {
          allWarnings.push(`${row.territoryId}: no price points available — skipped`);
          return null;
        }
        const snapped = snapToPricePoint(points, row.price);
        if (!snapped) {
          allWarnings.push(`${row.territoryId}: no price points available — skipped`);
          return null;
        }
        const snappedPrice = snapped.attributes.customerPrice;
        const wasSnapped = Number(snappedPrice) !== row.price;
        const currentPrice = activePrices.find((r) => r.territoryId === row.territoryId)?.customerPrice ?? null;
        const current = currentPrice === null ? null : Number(currentPrice);
        const next = Number(snappedPrice);
        const changePercent = current && current > 0 ? ((next - current) / current) * 100 : null;
        const direction = current === null ? "new" : next > current ? "increase" : next < current ? "decrease" : "unchanged";
        if (changePercent !== null && Math.abs(changePercent) > 25) {
          allWarnings.push(`${row.territoryId}: ${changePercent.toFixed(0)}% ${direction}; explicit confirmation required.`);
        }
        const finalPolicyTarget = finalPolicyTargets?.get(row.territoryId);
        const notes = [
          wasSnapped ? `snapped from ${row.price}` : null,
          finalPolicyTarget !== undefined && Math.abs(finalPolicyTarget - row.price) > 0.000001
            ? `final policy target ${finalPolicyTarget.toFixed(2)}; staged by movement cap`
            : null,
        ].filter((value): value is string => value !== null);
        return {
          territoryId: row.territoryId,
          currency: territoriesMap.get(row.territoryId) ?? "",
          currentPrice,
          requested: row.price,
          snappedPrice,
          pointId: snapped.id,
          note: notes.length > 0 ? notes.join(" · ") : null,
          changePercent,
          direction,
        } satisfies SubImportRow;
      });
      const previewRows = resolved
        .filter((r): r is SubImportRow => r !== null)
        .sort((a, b) => a.territoryId.localeCompare(b.territoryId));
      setImportPreview(previewRows.length > 0 ? previewRows : null);
      if (previewRows.length === 0) {
        setError("Apple returned price points, but none could be matched to the requested territories. Refresh and try again; no prices were changed.");
      }
      setImportWarnings([...allWarnings]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportProgress(null);
    }
  }

  /** Save current active prices locally before any write — the undo button. */
  async function snapshotBeforeApply(label: string) {
    if (!selectedSubId) throw new Error("Choose a subscription first.");
    await takeRequiredSnapshot({
      appId: id,
      scope: `sub:${selectedSubId}`,
      label,
      rows: activePrices.map((r) => ({
        territoryId: r.territoryId,
        pricePointId: r.pricePointId,
        customerPrice: r.customerPrice,
        currency: r.currency,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  /**
   * Write prices to Apple: per territory, cancel any FUTURE scheduled price
   * (current/historical entries 409 on DELETE), then POST the new price.
   */
  async function postPrices(
    rows: Array<Pick<SubImportRow, "territoryId" | "pointId" | "currentPrice" | "snappedPrice">>
  ) {
    if (!credentials || !selectedSubId) return;
    let done = 0;
    const BATCH = 4;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const ascFetchWithRetry: typeof ascFetch = async (creds, path, opts, retries = 3) => {
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          return await ascFetch(creds, path, opts);
        } catch (err) {
          if (err instanceof AscError && err.status === 429 && attempt < retries - 1) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
      return ascFetch(creds, path, opts);
    };
    for (let i = 0; i < rows.length; i += BATCH) {
      if (i > 0) await sleep(150);
      const batch = rows.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (row) => {
          const existing = currentByTerritory.get(row.territoryId) ?? [];
          // Attempt to cancel any future-scheduled prices. A 409 here means
          // the price became effective since we last loaded (timezone boundary,
          // or the page was open overnight) — treat it as current, not future.
          let hasCurrent = existing.some(
            (e) => !e.startDate || e.startDate <= today
          );
          for (const e of existing) {
            if (!e.startDate || e.startDate <= today) continue;
            try {
              await ascFetchWithRetry(credentials, `/v1/subscriptionPrices/${e.priceId}`, {
                method: "DELETE",
              });
            } catch (deleteErr) {
              if (deleteErr instanceof AscError && deleteErr.status === 409) {
                // Apple says this price is already current — can't delete it.
                // Mark hasCurrent so we schedule tomorrow instead of null.
                hasCurrent = true;
              } else {
                throw deleteErr;
              }
            }
          }
          // Apple only allows ONE startDate:null (current) subscriptionPrices
          // resource per (subscription, territory). If a current price already
          // exists we cannot POST another null one (409) and cannot DELETE the
          // existing one (409) — the only valid path is to schedule the change
          // with startDate = tomorrow.
          const startDate = hasCurrent
            ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
            : null;
          // Post the new price. If Apple rejects the startDate as "too early"
          // (timezone boundary: our UTC tomorrow is still Apple's today), parse
          // the minimum date from the error and retry once with it.
          const isIncrease = row.currentPrice !== null && Number(row.snappedPrice) > Number(row.currentPrice);
          const subPriceBody = (date: string | null) => ({
            data: {
              type: "subscriptionPrices",
              // CREATE uses preserveCurrentPrice. The similarly named
              // `preserved` field is read-only and appears only on responses.
              // Apple only supports preservation for eligible increases;
              // decreases automatically affect renewals.
              attributes: {
                startDate: date,
                ...(isIncrease ? { preserveCurrentPrice: preserveExistingSubscribers } : {}),
              },
              relationships: {
                subscription: { data: { type: "subscriptions", id: selectedSubId } },
                subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: row.pointId } },
                territory: { data: { type: "territories", id: row.territoryId } },
              },
            },
          });
          try {
            await ascFetchWithRetry(credentials, `/v1/subscriptionPrices`, {
              method: "POST",
              body: subPriceBody(startDate),
            });
          } catch (postErr) {
            if (postErr instanceof AscError && postErr.status === 409 && startDate !== null) {
              const match = postErr.detail.match(/on or after (\d{4}-\d{2}-\d{2})/);
              if (match) {
                await ascFetchWithRetry(credentials, `/v1/subscriptionPrices`, {
                  method: "POST",
                  body: subPriceBody(match[1]),
                });
              } else {
                throw postErr;
              }
            } else {
              throw postErr;
            }
          }
          done++;
          setApplying({ done, total: rows.length });
        })
      );
      const rejected = results
        .map((result, index) => result.status === "rejected" ? `${batch[index].territoryId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}` : null)
        .filter((value): value is string => value !== null);
      if (rejected.length > 0) {
        throw new Error(`Stopped after ${done} successful changes. Some territories may already be scheduled: ${rejected.join(" · ")}`);
      }
    }
  }

  async function applyImport(snapshotName?: string) {
    if (!credentials || !importPreview || !selectedSubId) return;
    setSnapshotDialog(false);
    setError("");
    setApplying({ done: 0, total: importPreview.length });
    try {
      if (previewMovementCap !== null) {
        const violations = findMovementCapViolations(
          new Map(
            activePrices.map((row) => [row.territoryId, Number(row.customerPrice)])
          ),
          new Map(
            importPreview.map((row) => [row.territoryId, Number(row.snappedPrice)])
          ),
          previewMovementCap
        );
        if (violations.length > 0) {
          throw new Error(
            movementCapErrorMessage(violations, previewMovementCap)
          );
        }
      }
      await snapshotBeforeApply(
        snapshotName || `Before import · ${importPreview.length} territories`
      );
      await postPrices(importPreview);
      await verifySubscriptionPricePoints(
        new Map(importPreview.map((row) => [row.territoryId, row.pointId]))
      );
      setApplySummary({
        productLabel:
          subscriptions.find((s) => s.id === selectedSubId)?.attributes.name ?? selectedSubId,
        regionsChanged: importPreview.length,
        warnings: importWarnings,
        verified: true,
      });
      setApplied(true);
      setImportPreview(null);
      setSheetText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // A batch is not atomic: valid rows in the same batch may have reached
      // Apple before another row failed. Reconcile immediately so the UI shows
      // the authoritative active/upcoming state before a retry.
      await loadPrices(selectedSubId);
    } finally {
      setApplying(null);
    }
  }

  async function cancelPendingSnapshotMistakes(territoryIds: Set<string>) {
    const pending = upcomingPrices.filter((price) => territoryIds.has(price.territoryId));
    let cancelled = 0;
    const becameCurrent = new Set<string>();
    for (let index = 0; index < pending.length; index += 4) {
      const batch = pending.slice(index, index + 4);
      const results = await Promise.allSettled(
        batch.map((price) => ascFetch(credentials!, `/v1/subscriptionPrices/${price.priceId}`, { method: "DELETE" }))
      );
      results.forEach((result, resultIndex) => {
        if (result.status === "fulfilled") {
          cancelled += 1;
          return;
        }
        const reason = result.reason;
        if (reason instanceof AscError && reason.status === 409) {
          becameCurrent.add(batch[resultIndex].territoryId);
          return;
        }
        // A refresh or another tab may already have removed the schedule.
        if (reason instanceof AscError && reason.status === 404) return;
        throw reason;
      });
    }
    return { cancelled, becameCurrent };
  }

  /** Restore the previous storefront grid at Apple's earliest permitted date. */
  async function restoreSnapshot(snapshot: PriceSnapshot) {
    if (!credentials || !selectedSubId) return;
    setError("");
    setApplying({ done: 0, total: snapshot.rows.length });
    try {
      await snapshotBeforeApply(`Before restoring · ${snapshot.label}`);
      const activeByTerritory = new Map(activePrices.map((price) => [price.territoryId, price.customerPrice]));
      // Remove pending schedules across the whole restore scope first. Leaving
      // a later pending change behind could silently undo the restored grid.
      const cancellation = await cancelPendingSnapshotMistakes(
        new Set(snapshot.rows.map((row) => row.territoryId))
      );
      const rowsToRestore = snapshot.rows.filter(
        (row) =>
          activeByTerritory.get(row.territoryId) !== row.customerPrice ||
          cancellation.becameCurrent.has(row.territoryId)
      );
      if (rowsToRestore.length > 0) await postPrices(
        rowsToRestore.map((r) => ({
          territoryId: r.territoryId,
          pointId: r.pricePointId,
          currentPrice: activePrices.find((price) => price.territoryId === r.territoryId)?.customerPrice ?? null,
          snappedPrice: r.customerPrice,
        }))
      );
      await verifySubscriptionPricePoints(
        new Map(snapshot.rows.map((row) => [row.territoryId, row.pricePointId]))
      );
      setApplySummary({
        productLabel:
          subscriptions.find((s) => s.id === selectedSubId)?.attributes.name ?? selectedSubId,
        regionsChanged: rowsToRestore.length + cancellation.cancelled,
        warnings: [
          cancellation.cancelled > 0 ? `${cancellation.cancelled} pending price changes were cancelled before taking effect.` : "",
          rowsToRestore.length > 0 ? `${rowsToRestore.length} previous storefront prices were scheduled at Apple's earliest permitted date.` : "",
          "Restoration returns the storefront grid; it cannot reverse billing that already occurred.",
        ].filter(Boolean),
        verified: true,
      });
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await loadPrices(selectedSubId);
    } finally {
      setApplying(null);
    }
  }

  function exportCsv() {
    const rows = activePrices.map((r) => ({
      territoryId: r.territoryId,
      currency: r.currency,
      customerPrice: r.customerPrice,
    }));
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const subName = subscriptions.find((s) => s.id === selectedSubId)?.attributes.name ?? selectedSubId;
    a.download = `sub-prices-${subName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function saveNamedSnapshot(label: string) {
    if (!selectedSubId) return;
    takeSnapshot({
      appId: id,
      scope: `sub:${selectedSubId}`,
      label,
      rows: activePrices.map((r) => ({
        territoryId: r.territoryId,
        pricePointId: r.pricePointId,
        customerPrice: r.customerPrice,
        currency: r.currency,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  const filteredActive = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return activePrices;
    return activePrices.filter((r) => r.territoryId.includes(q) || r.currency.includes(q));
  }, [activePrices, search]);

  const filteredUpcoming = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return upcomingPrices;
    return upcomingPrices.filter((r) => r.territoryId.includes(q) || r.currency.includes(q));
  }, [upcomingPrices, search]);

  const selectedSub = subscriptions.find((s) => s.id === selectedSubId);

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-5xl mx-auto w-full px-6 py-10">
      <TopBar backToApps />

      <AppTabs appId={id} active="subscriptions" />

      <h1 className="text-xl font-bold mb-1">Subscription pricing</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Build a new worldwide price system from a store anchor, or make a bounded adjustment to current prices.
      </p>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {applySummary && (
        <ApplySuccessDialog
          productLabel={applySummary.productLabel}
          regionsChanged={applySummary.regionsChanged}
          warnings={applySummary.warnings}
          verified={applySummary.verified}
          onClose={() => setApplySummary(null)}
        />
      )}

      {/* Subscription selector */}
      <div className="card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Select subscription</h2>
          {subscriptions.length > 1 && (
            <span className="text-xs text-zinc-500 font-mono">
              {subscriptions.length} subscriptions
            </span>
          )}
        </div>
        {loadingGroups ? (
          <p className="text-sm text-zinc-400 animate-pulse">Loading subscriptions…</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm text-zinc-400">No subscriptions found for this app.</p>
        ) : (
          <select
            value={selectedSubId}
            onChange={(e) => setSelectedSubId(e.target.value)}
            className="w-full max-w-md rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Choose a subscription…</option>
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.attributes.name} — {formatPeriod(s.attributes.subscriptionPeriod)} · {s.attributes.productId}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedSubId && (
        <>
          {/* Import sheet */}
          <div className="card card-hero p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold">
                Pricing workspace
              </h2>
              </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setPricingMode("anchor")} className={`rounded-md border px-3 py-2 text-xs ${pricingMode === "anchor" ? "border-emerald-600 bg-emerald-950/50 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>
                New worldwide anchor
              </button>
              <button onClick={() => setPricingMode("adjust")} className={`rounded-md border px-3 py-2 text-xs ${pricingMode === "adjust" ? "border-emerald-600 bg-emerald-950/50 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>
                Adjust current prices
              </button>
            </div>

            {pricingMode === "anchor" ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 mb-4">
                <p className="text-sm font-medium text-zinc-200 mb-1">Target a USA price and safely move the worldwide grid toward it</p>
                <p className="text-xs text-zinc-500 mb-3">Apple equalizations form the baseline. Market policy adjusts that baseline; the movement cap only stages how far each current price moves this cycle.</p>
                <div className="flex flex-wrap gap-3 items-end mb-3">
                  <label className="text-xs text-zinc-400">
                    <span className="block mb-1">USA anchor</span>
                    {anchorPoints.length === 0 ? (
                      <button onClick={loadUsAnchorPoints} disabled={anchorLoading} className="rounded-md border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-emerald-600 disabled:opacity-40">
                        {anchorLoading ? "Loading USA tiers…" : "Choose USA price"}
                      </button>
                    ) : (
                      <select value={selectedAnchorPointId} onChange={(event) => setSelectedAnchorPointId(event.target.value)} className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100">
                        {anchorPoints.map((point) => <option key={point.id} value={point.id}>${point.attributes.customerPrice}</option>)}
                      </select>
                    )}
                  </label>
                  <label className="text-xs text-zinc-400">
                    <span className="block mb-1">Maximum movement this cycle</span>
                    <span className="flex items-center gap-1"><input type="number" min={1} max={50} value={anchorMaxChangePercent} onChange={(event) => setAnchorMaxChangePercent(Math.max(1, Math.min(50, Number(event.target.value) || 1)))} className="w-20 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100" />%</span>
                  </label>
                </div>
                <label className="mb-3 flex items-start gap-2 text-xs text-zinc-400">
                  <input type="checkbox" checked={applyFullAnchorTarget} onChange={(event) => setApplyFullAnchorTarget(event.target.checked)} className="mt-0.5 accent-amber-500" />
                  <span>Apply the full policy target now instead of staging local movements. Changes over 25% will still require explicit confirmation.</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {STRATEGIES.map((policy) => <button key={policy.key} onClick={() => setStrategy(policy.key)} className={`rounded border px-2.5 py-1 text-xs ${strategy === policy.key ? "border-emerald-700 bg-emerald-950/60 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}>{policy.emoji} {policy.label}</button>)}
                </div>
                <button onClick={generateAnchorPreview} disabled={!selectedAnchorPointId || anchorLoading} className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-40">
                  {anchorLoading ? "Building worldwide baseline…" : "Generate anchored preview"}
                </button>
              </div>
            ) : (
              <AiRepricePanel
                getCsv={() => buildCsv(activePrices.map((r) => ({ territoryId: r.territoryId, currency: r.currency, customerPrice: r.customerPrice })))}
                platform="ios"
                strategy={strategy}
                onStrategyChange={setStrategy}
                onResult={async (csv, cap) => {
                  setPreviewMovementCap(cap);
                  setSheetText(csv);
                  await buildImportPreview(csv);
                }}
                disabled={activePrices.length === 0}
                onExportCsv={exportCsv}
              />
            )}
            <textarea
              value={sheetText}
              onChange={(e) => {
                setSheetText(e.target.value);
                setImportPreview(null);
                setPreviewMovementCap(null);
              }}
              placeholder={"territory,price\nUSA,4.99\nEGY,49.99\nDEU,3.99"}
              rows={4}
              className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none resize-y"
            />

            <div className="flex flex-wrap items-center gap-3 mt-3">
              <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                <input
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  id="sub-csv-file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSheetText(await f.text());
                      setImportPreview(null);
                      setPreviewMovementCap(null);
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById("sub-csv-file")?.click()}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 transition"
                >
                  Upload .csv
                </button>
              </label>
              <button
                onClick={() => buildImportPreview()}
                disabled={!sheetText.trim() || importProgress !== null}
                className="rounded-md bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {importProgress
                  ? `Validating Apple tiers ${importProgress.done}/${importProgress.total}…`
                  : "Preview import"}
              </button>

              {importPreview && (
                  !applied ? (
                  <button
                    onClick={() => (isPro ? setSnapshotDialog(true) : setPaywallOpen(true))}
                    disabled={applying !== null || ((previewImpact.decreases > 0 || previewImpact.highRisk > 0) && !acknowledgedImpact)}
                    className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:shadow-none transition"
                  >
                    {applying !== null
                      ? `Applying ${applying.done}/${applying.total}…`
                      : `${isPro ? "" : "🔒 "}Apply ${importPreview.length} prices`}
                  </button>
                  ) : (
                    <span className="text-xs text-emerald-400">
                      ✓ Applied — start a new import to make further changes.
                    </span>
                  )
                )}
              </div>

              {importPreview && !applied && (
                <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2.5 text-xs text-zinc-300 space-y-2">
                  {previewImpact.increases > 0 && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" checked={preserveExistingSubscribers} onChange={(e) => setPreserveExistingSubscribers(e.target.checked)} className="mt-0.5 accent-emerald-500" />
                      <span>For the {previewImpact.increases} price increase{previewImpact.increases === 1 ? "" : "s"}, request that Apple preserve existing subscriber prices where allowed.</span>
                    </label>
                  )}
                  {previewImpact.decreases > 0 && <p className="text-amber-300">{previewImpact.decreases} decrease{previewImpact.decreases === 1 ? "" : "s"} will lower renewal prices for existing subscribers. Apple does not offer preservation for decreases.</p>}
                  {(previewImpact.decreases > 0 || previewImpact.highRisk > 0) && (
                    <label className="flex items-start gap-2 cursor-pointer font-medium">
                      <input type="checkbox" checked={acknowledgedImpact} onChange={(e) => setAcknowledgedImpact(e.target.checked)} className="mt-0.5 accent-amber-500" />
                      <span>I reviewed the {previewImpact.highRisk > 0 ? `${previewImpact.highRisk} change${previewImpact.highRisk === 1 ? "" : "s"} over 25% and ` : ""}subscriber impact. I understand this cannot be automatically undone after it takes effect.</span>
                    </label>
                  )}
                </div>
              )}

            {importWarnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-400 space-y-0.5 max-h-24 overflow-y-auto">
                {importWarnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}

            {importPreview && (
              <div className="mt-3 rounded-lg border border-zinc-800 overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-left text-zinc-400">
                        <th className="px-4 py-2 font-medium">Territory</th>
                        <th className="px-4 py-2 font-medium">Current</th>
                        <th className="px-4 py-2 font-medium">Sheet says</th>
                        <th className="px-4 py-2 font-medium">Will set</th>
                        <th className="px-4 py-2 font-medium">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((r) => (
                        <tr key={r.territoryId} className="border-t border-zinc-800/60">
                          <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                          <td className="px-4 py-2 text-zinc-500 font-mono">
                            {r.currentPrice !== null ? formatPrice(r.currentPrice, r.currency) : "—"}
                          </td>
                          <td className="px-4 py-2 text-zinc-500 font-mono">{r.requested}</td>
                          <td className="px-4 py-2 font-mono">
                            {formatPrice(r.snappedPrice, r.currency)}
                            {r.note && <span className="ml-2 text-xs text-amber-400">{r.note}</span>}
                          </td>
                          <td className={`px-4 py-2 font-mono text-xs ${r.direction === "decrease" ? "text-amber-300" : r.direction === "increase" ? "text-emerald-300" : "text-zinc-500"}`}>
                            {r.changePercent === null ? "New" : `${r.changePercent > 0 ? "+" : ""}${r.changePercent.toFixed(0)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Snapshots */}
          <SnapshotPanel
            appId={id}
            scope={`sub:${selectedSubId}`}
            refreshKey={snapRefresh}
            onRestore={restoreSnapshot}
            onSave={saveNamedSnapshot}
            busy={applying !== null}
          />

          {/* Prices header + search */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              Prices
              {selectedSub && (
                <span className="ml-2 text-zinc-500 font-normal text-sm">
                  {selectedSub.attributes.name} · {formatPeriod(selectedSub.attributes.subscriptionPeriod)}
                </span>
              )}
            </h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter: USA, EGY, EUR…"
              className="rounded-md bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm w-48 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {loadingPrices && (
            <p className="text-zinc-400 animate-pulse text-sm">Loading prices…</p>
          )}

          {!loadingPrices && currentPrices.length === 0 && (
            <p className="text-sm text-zinc-400 rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              No prices found for this subscription. Set prices in App Store Connect first, then manage them here.
            </p>
          )}

          {/* Upcoming scheduled prices */}
          {!loadingPrices && filteredUpcoming.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-amber-400 mb-2">
                Upcoming price changes ({upcomingPrices.length} territories)
              </p>
              <div className="rounded-xl border border-amber-900/50 overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-zinc-900">
                      <tr className="text-left text-zinc-400">
                        <th className="px-4 py-2 font-medium">Territory</th>
                        <th className="px-4 py-2 font-medium">Currency</th>
                        <th className="px-4 py-2 font-medium">New Price</th>
                        <th className="px-4 py-2 font-medium">Effective</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUpcoming.map((r) => (
                        <tr key={r.priceId} className="border-t border-zinc-800/60">
                          <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                          <td className="px-4 py-2 text-zinc-500">{r.currency}</td>
                          <td className="px-4 py-2 font-mono">{formatPrice(r.customerPrice, r.currency)}</td>
                          <td className="px-4 py-2 text-xs text-amber-400">{r.startDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Current active prices */}
          {!loadingPrices && activePrices.length > 0 && (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left text-zinc-400">
                      <th className="px-4 py-2 font-medium">Territory</th>
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-4 py-2 font-medium">Current Price</th>
                      <th className="px-4 py-2 font-medium">Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActive.map((r) => (
                      <tr key={r.priceId} className="border-t border-zinc-800/60">
                        <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                        <td className="px-4 py-2 text-zinc-500">{r.currency}</td>
                        <td className="px-4 py-2 font-mono">{formatPrice(r.customerPrice, r.currency)}</td>
                        <td className="px-4 py-2 text-xs text-zinc-500">{r.startDate ?? "Starting price"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <SnapshotConfirmDialog
        open={snapshotDialog}
        defaultName={importPreview ? `Before import · ${importPreview.length} territories` : ""}
        onSaveAndApply={(name) => applyImport(name)}
        onCancel={() => setSnapshotDialog(false)}
      />
      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        pending={
          importPreview
            ? {
                count: importPreview.length,
                unit: "subscription price changes",
                manualMinutes: estimateManualMinutes(
                  "subscription",
                  importPreview.length
                ),
              }
            : undefined
        }
      />
    </main>
  );
}
