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
import { takeSnapshot, type PriceSnapshot } from "@/lib/snapshots";
import { buildCsv, parsePriceSheet, snapToPricePoint } from "@/lib/pricing-import";
import { type PricingStrategy, getStrategy } from "@/lib/pricing-strategies";
import { AiRepricePanel } from "@/components/AiRepricePanel";
import type {
  InAppPurchase,
  InAppPurchasePrice,
  InAppPurchasePricePoint,
  IapPriceRow,
  Territory,
  AscResource,
} from "@/lib/asc/types";
import { formatIapType } from "@/lib/asc/types";

interface IapImportRow {
  territoryId: string;
  currency: string;
  currentPrice: string | null;
  requested: number;
  snappedPrice: string;
  pointId: string;
  note: string | null;
}

// Cached price points per IAP — same bulk fetch trick as subscriptions
const allPointsCache = new Map<string, Map<string, InAppPurchasePricePoint[]>>();

function formatPrice(price: string, currency: string): string {
  const n = Number(price);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
  } catch {
    return `${price} ${currency}`;
  }
}

function resolveIapPrices(
  scheduleData: AscResource<Record<string, never>>,
  included: Array<InAppPurchasePrice | InAppPurchasePricePoint | Territory>
): IapPriceRow[] {
  const priceMap = new Map<string, InAppPurchasePrice>();
  const pointMap = new Map<string, InAppPurchasePricePoint>();
  const terrMap = new Map<string, Territory>();

  for (const inc of included) {
    if (inc.type === "inAppPurchasePrices") priceMap.set(inc.id, inc as InAppPurchasePrice);
    if (inc.type === "inAppPurchasePricePoints") pointMap.set(inc.id, inc as InAppPurchasePricePoint);
    if (inc.type === "territories") terrMap.set(inc.id, inc as Territory);
  }

  const manualPriceRefs = scheduleData.relationships?.manualPrices?.data;
  if (!manualPriceRefs || !Array.isArray(manualPriceRefs)) return [];

  const rows: IapPriceRow[] = [];
  for (const ref of manualPriceRefs) {
    if (Array.isArray(ref)) continue;
    const price = priceMap.get(ref.id);
    if (!price) continue;

    const pointRef = price.relationships?.inAppPurchasePricePoint?.data;
    const terrRef = price.relationships?.territory?.data;
    if (!pointRef || Array.isArray(pointRef) || !terrRef || Array.isArray(terrRef)) continue;

    const point = pointMap.get(pointRef.id);
    const territory = terrMap.get(terrRef.id);
    if (!point) continue;

    rows.push({
      territoryId: terrRef.id,
      currency: territory?.attributes.currency ?? "",
      customerPrice: point.attributes.customerPrice,
      pricePointId: point.id,
      priceId: price.id,
    });
  }

  return rows;
}

export default function IapPage() {
  const { id } = useParams<{ id: string }>();
  const { credentials } = useCredentials();

  const [hydrated, setHydrated] = useState(false);
  const [loadingIaps, setLoadingIaps] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [error, setError] = useState("");

  const [iaps, setIaps] = useState<InAppPurchase[]>([]);
  const [selectedIapId, setSelectedIapId] = useState("");
  const [currentPrices, setCurrentPrices] = useState<IapPriceRow[]>([]);
  const [territoriesMap, setTerritoriesMap] = useState<Map<string, string>>(new Map());
  const [search, setSearch] = useState("");

  // Import flow
  const [sheetText, setSheetText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<IapImportRow[] | null>(null);
  const [importProgress, setImportProgress] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [strategy, setStrategy] = useState<PricingStrategy>("ppp");

  // Pro gate + snapshots
  const isPro = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [snapRefresh, setSnapRefresh] = useState(0);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!credentials || !hydrated) return;
    ascFetchAllFull<Territory>(credentials, "/v1/territories")
      .then(({ data }) =>
        setTerritoriesMap(new Map(data.map((t) => [t.id, t.attributes.currency])))
      )
      .catch(() => {});
  }, [credentials, hydrated]);

  // Load all IAPs for this app
  useEffect(() => {
    if (!credentials || !hydrated) return;
    setLoadingIaps(true);
    setError("");

    ascFetchAllFull<InAppPurchase>(credentials, `/v1/apps/${id}/inAppPurchasesV2`)
      .then(({ data }) => {
        const sorted = data.sort((a, b) => a.attributes.name.localeCompare(b.attributes.name));
        setIaps(sorted);
        if (sorted.length === 1) setSelectedIapId(sorted[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingIaps(false));
  }, [credentials, hydrated, id]);

  const loadPrices = useCallback(
    async (iapId: string) => {
      if (!credentials || !iapId) return;
      setLoadingPrices(true);
      setError("");
      setCurrentPrices([]);
      try {
        const response = await ascFetch<{
          data: AscResource<Record<string, never>>;
          included?: Array<InAppPurchasePrice | InAppPurchasePricePoint | Territory>;
        }>(credentials, `/v1/inAppPurchasesV2/${iapId}/priceSchedule`, {
          params: {
            include:
              "manualPrices,manualPrices.inAppPurchasePricePoint,manualPrices.territory",
          },
        });
        const rows = resolveIapPrices(response.data, response.included ?? []);
        setCurrentPrices(rows.sort((a, b) => a.territoryId.localeCompare(b.territoryId)));
      } catch (e) {
        if (e instanceof AscError && e.status === 404) {
          // No price schedule yet — IAP has never been priced
          setCurrentPrices([]);
        } else {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        setLoadingPrices(false);
      }
    },
    [credentials]
  );

  useEffect(() => {
    if (selectedIapId) {
      setImportPreview(null);
      setSheetText("");
      setApplied(false);
      loadPrices(selectedIapId);
    }
  }, [selectedIapId, loadPrices]);

  /** Bulk fetch ALL price points for this IAP (cached per session). */
  async function loadAllPricePoints(): Promise<Map<string, InAppPurchasePricePoint[]>> {
    const cached = allPointsCache.get(selectedIapId);
    if (cached) return cached;

    const { data } = await ascFetchAllFull<InAppPurchasePricePoint>(
      credentials!,
      `/v1/inAppPurchasesV2/${selectedIapId}/pricePoints`,
      { include: "territory", limit: "8000" }
    );

    const byTerritory = new Map<string, InAppPurchasePricePoint[]>();
    for (const p of data) {
      const terrRef = p.relationships?.territory?.data;
      if (!terrRef || Array.isArray(terrRef)) continue;
      const arr = byTerritory.get(terrRef.id) ?? [];
      arr.push(p);
      byTerritory.set(terrRef.id, arr);
    }
    allPointsCache.set(selectedIapId, byTerritory);
    return byTerritory;
  }

  async function buildImportPreview(csvOverride?: string) {
    const _text = csvOverride ?? sheetText;
    if (!credentials || !_text.trim() || !selectedIapId) return;
    setError("");
    setApplied(false);
    setImportPreview(null);
    setImportProgress(true);

    const { rows, warnings } = parsePriceSheet(_text);
    const allWarnings = [...warnings];

    const valid = rows.filter((r) => {
      if (territoriesMap.size > 0 && !territoriesMap.has(r.territoryId)) {
        allWarnings.push(`${r.territoryId}: not an App Store territory — skipped`);
        return false;
      }
      return true;
    });

    if (valid.length === 0) {
      setError("No usable rows. Expected CSV: territory,price (3-letter codes like USA, EGY).");
      setImportProgress(false);
      return;
    }

    try {
      const pointsByTerritory = await loadAllPricePoints();

      const resolved = valid.map((row) => {
        const points = pointsByTerritory.get(row.territoryId);
        if (!points || points.length === 0) {
          allWarnings.push(`${row.territoryId}: no price points available — skipped`);
          return null;
        }
        const snapped = snapToPricePoint(points, row.price);
        if (!snapped) {
          allWarnings.push(`${row.territoryId}: could not snap to a valid tier — skipped`);
          return null;
        }
        const snappedPrice = snapped.attributes.customerPrice;
        const wasSnapped = Number(snappedPrice) !== row.price;
        return {
          territoryId: row.territoryId,
          currency: territoriesMap.get(row.territoryId) ?? "",
          currentPrice:
            currentPrices.find((r) => r.territoryId === row.territoryId)?.customerPrice ?? null,
          requested: row.price,
          snappedPrice,
          pointId: snapped.id,
          note: wasSnapped ? `snapped from ${row.price}` : null,
        } satisfies IapImportRow;
      });

      setImportPreview(
        resolved
          .filter((r): r is IapImportRow => r !== null)
          .sort((a, b) => a.territoryId.localeCompare(b.territoryId))
      );
      setImportWarnings([...allWarnings]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportProgress(false);
    }
  }

  function snapshotBeforeApply(label: string) {
    if (currentPrices.length === 0 || !selectedIapId) return;
    takeSnapshot({
      appId: id,
      scope: `iap:${selectedIapId}`,
      label,
      rows: currentPrices.map((r) => ({
        territoryId: r.territoryId,
        pricePointId: r.pricePointId,
        customerPrice: r.customerPrice,
        currency: r.currency,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  /**
   * POST a new inAppPurchasePriceSchedule with all territories set manually.
   * Merges import rows on top of current prices — territories not in the import
   * keep their existing price so no territory is accidentally cleared.
   */
  async function postPriceSchedule(
    importRows: Array<{ territoryId: string; pointId: string }>
  ) {
    if (!credentials || !selectedIapId) return;

    // Build merged set: start from current prices, override with import
    const importMap = new Map(importRows.map((r) => [r.territoryId, r.pointId]));
    const merged: Array<{ territoryId: string; pointId: string }> = [];

    // Current prices not overridden by import
    for (const existing of currentPrices) {
      if (!importMap.has(existing.territoryId)) {
        merged.push({ territoryId: existing.territoryId, pointId: existing.pricePointId });
      }
    }
    // All import rows
    for (const row of importRows) {
      merged.push(row);
    }

    const included = merged.map((row, i) => ({
      type: "inAppPurchasePrices",
      id: `$p${i}`,
      attributes: { startDate: null },
      relationships: {
        inAppPurchasePricePoint: {
          data: { type: "inAppPurchasePricePoints", id: row.pointId },
        },
        territory: {
          data: { type: "territories", id: row.territoryId },
        },
      },
    }));

    await ascFetch(credentials, "/v1/inAppPurchasePriceSchedules", {
      method: "POST",
      body: {
        data: {
          type: "inAppPurchasePriceSchedules",
          relationships: {
            inAppPurchase: {
              data: { type: "inAppPurchasesV2", id: selectedIapId },
            },
            manualPrices: {
              data: merged.map((_, i) => ({ type: "inAppPurchasePrices", id: `$p${i}` })),
            },
          },
        },
        included,
      },
    });
  }

  async function applyImport() {
    if (!credentials || !importPreview || !selectedIapId) return;
    setError("");
    setApplying(true);
    try {
      snapshotBeforeApply(`Before sheet import · ${importPreview.length} territories`);
      await postPriceSchedule(
        importPreview.map((r) => ({ territoryId: r.territoryId, pointId: r.pointId }))
      );
      setApplied(true);
      setImportPreview(null);
      setSheetText("");
      await loadPrices(selectedIapId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  async function restoreSnapshot(snapshot: PriceSnapshot) {
    if (!credentials || !selectedIapId) return;
    setError("");
    setApplying(true);
    try {
      snapshotBeforeApply("Before restore (auto-safety)");
      await postPriceSchedule(
        snapshot.rows.map((r) => ({ territoryId: r.territoryId, pointId: r.pricePointId }))
      );
      setApplied(true);
      await loadPrices(selectedIapId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function exportCsv() {
    const rows = currentPrices.map((r) => ({
      territoryId: r.territoryId,
      currency: r.currency,
      customerPrice: r.customerPrice,
    }));
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const iapName =
      iaps.find((i) => i.id === selectedIapId)?.attributes.productId ?? selectedIapId;
    a.download = `iap-prices-${iapName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAiPrompt() {
    const rows = currentPrices.map((r) => ({
      territoryId: r.territoryId,
      currency: r.currency,
      customerPrice: r.customerPrice,
    }));
    await navigator.clipboard.writeText(getStrategy(strategy).buildPrompt(buildCsv(rows)));
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  function saveNamedSnapshot(label: string) {
    if (!selectedIapId) return;
    takeSnapshot({
      appId: id,
      scope: `iap:${selectedIapId}`,
      label,
      rows: currentPrices.map((r) => ({
        territoryId: r.territoryId,
        pricePointId: r.pricePointId,
        customerPrice: r.customerPrice,
        currency: r.currency,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  const filteredPrices = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return currentPrices;
    return currentPrices.filter(
      (r) => r.territoryId.includes(q) || r.currency.includes(q)
    );
  }, [currentPrices, search]);

  const selectedIap = iaps.find((i) => i.id === selectedIapId);

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-5xl mx-auto w-full px-6 py-10">
      <TopBar backToApps />

      <AppTabs appId={id} active="iap" />

      <h1 className="text-xl font-bold mb-1">In-App Purchase pricing</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Manage prices across all 175 storefronts for your consumables, non-consumables, and
        lifetime plans. One apply = one request to Apple.
      </p>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {applied && (
        <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mb-4">
          ✓ IAP prices updated across all territories.
        </p>
      )}

      {/* IAP selector */}
      <div className="card p-5 mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-semibold">Select in-app purchase</h2>
          {iaps.length > 1 && (
            <span className="text-xs text-zinc-500 font-mono">{iaps.length} IAPs</span>
          )}
        </div>

        {loadingIaps ? (
          <p className="text-sm text-zinc-400 animate-pulse">Loading in-app purchases…</p>
        ) : iaps.length === 0 ? (
          <p className="text-sm text-zinc-400">No in-app purchases found for this app.</p>
        ) : (
          <div className="max-w-md">
            <input
              list="iap-list"
              value={
                selectedIap
                  ? `${selectedIap.attributes.name} · ${formatIapType(selectedIap.attributes.inAppPurchaseType)} · ${selectedIap.attributes.productId}`
                  : ""
              }
              onChange={(e) => {
                const text = e.target.value;
                const found = iaps.find(
                  (i) =>
                    `${i.attributes.name} · ${formatIapType(i.attributes.inAppPurchaseType)} · ${i.attributes.productId}` ===
                    text
                );
                if (found) setSelectedIapId(found.id);
              }}
              placeholder="Choose an IAP… (type to search)"
              className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="iap-list">
              {iaps.map((i) => (
                <option
                  key={i.id}
                  value={`${i.attributes.name} · ${formatIapType(i.attributes.inAppPurchaseType)} · ${i.attributes.productId}`}
                />
              ))}
            </datalist>
          </div>
        )}
      </div>

      {selectedIapId && (
        <>
          {/* Import sheet */}
          <div className="card card-hero p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold">
                Import price sheet{" "}
                <span className="text-zinc-500 font-normal text-sm">
                  CSV from any AI or spreadsheet
                </span>
              </h2>
              </div>
            <AiRepricePanel
              getCsv={() => buildCsv(currentPrices.map((r) => ({ territoryId: r.territoryId, currency: r.currency, customerPrice: r.customerPrice })))}
              platform="ios"
              strategy={strategy}
              onStrategyChange={setStrategy}
              onResult={async (csv) => { setSheetText(csv); await buildImportPreview(csv); }}
              disabled={currentPrices.length === 0}
              onExportCsv={exportCsv}
              onCopyPrompt={copyAiPrompt}
              copiedPrompt={copiedPrompt}
            />
            <textarea
              value={sheetText}
              onChange={(e) => {
                setSheetText(e.target.value);
                setImportPreview(null);
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
                  id="iap-csv-file"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setSheetText(await f.text());
                      setImportPreview(null);
                    }
                  }}
                />
                <button
                  onClick={() => document.getElementById("iap-csv-file")?.click()}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 transition"
                >
                  Upload .csv
                </button>
              </label>

              <button
                onClick={() => buildImportPreview()}
                disabled={!sheetText.trim() || importProgress}
                className="rounded-md bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {importProgress
                  ? allPointsCache.has(selectedIapId)
                    ? "Snapping prices…"
                    : "Loading Apple price tiers (one-time per IAP)…"
                  : "Preview import"}
              </button>

              {importPreview &&
                (!applied ? (
                  <button
                    onClick={() => (isPro ? applyImport() : setPaywallOpen(true))}
                    disabled={applying}
                    className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:shadow-none transition"
                  >
                    {applying
                      ? "Applying…"
                      : `${isPro ? "" : "🔒 "}Apply ${importPreview.length} prices`}
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400">
                    ✓ Applied — start a new import to make further changes.
                  </span>
                ))}
            </div>

            {importWarnings.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-900 bg-amber-950/30 px-3 py-2 text-xs text-amber-400 space-y-0.5 max-h-24 overflow-y-auto">
                {importWarnings.map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
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
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((r) => (
                        <tr key={r.territoryId} className="border-t border-zinc-800/60">
                          <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                          <td className="px-4 py-2 text-zinc-500 font-mono">
                            {r.currentPrice !== null
                              ? formatPrice(r.currentPrice, r.currency)
                              : "—"}
                          </td>
                          <td className="px-4 py-2 text-zinc-500 font-mono">{r.requested}</td>
                          <td className="px-4 py-2 font-mono">
                            {formatPrice(r.snappedPrice, r.currency)}
                            {r.note && (
                              <span className="ml-2 text-xs text-amber-400">{r.note}</span>
                            )}
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
            scope={`iap:${selectedIapId}`}
            refreshKey={snapRefresh}
            onRestore={restoreSnapshot}
            onSave={saveNamedSnapshot}
            busy={applying}
          />

          {/* Prices table */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              Current prices
              {selectedIap && (
                <span className="ml-2 text-zinc-500 font-normal text-sm">
                  {selectedIap.attributes.name} ·{" "}
                  {formatIapType(selectedIap.attributes.inAppPurchaseType)}
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
              No prices found. Set an initial price in App Store Connect, then manage all
              territories here.
            </p>
          )}

          {!loadingPrices && currentPrices.length > 0 && (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left text-zinc-400">
                      <th className="px-4 py-2 font-medium">Territory</th>
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                      <th className="px-4 py-2 font-medium">Proceeds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrices.map((r) => (
                      <tr key={r.priceId} className="border-t border-zinc-800/60">
                        <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                        <td className="px-4 py-2 text-zinc-500">{r.currency}</td>
                        <td className="px-4 py-2 font-mono">
                          {formatPrice(r.customerPrice, r.currency)}
                        </td>
                        <td className="px-4 py-2 font-mono text-zinc-500 text-xs">
                          {r.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        pending={
          importPreview
            ? {
                count: importPreview.length,
                unit: "IAP price changes",
                manualMinutes: estimateManualMinutes("price", importPreview.length),
              }
            : undefined
        }
      />
    </main>
  );
}
