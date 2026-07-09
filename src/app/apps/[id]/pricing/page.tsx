"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { AscError, ascFetch, ascFetchAllFull } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
import { PaywallModal } from "@/components/Paywall";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { TopBar } from "@/components/TopBar";
import { useIsPro } from "@/lib/license";
import { takeSnapshot, type PriceSnapshot } from "@/lib/snapshots";
import {
  buildAiPrompt,
  buildCsv,
  parsePriceSheet,
  snapToPricePoint,
} from "@/lib/pricing-import";
import type {
  AppPrice,
  AppPricePoint,
  PriceRow,
  Territory,
} from "@/lib/asc/types";

interface PreviewRow {
  territoryId: string;
  currency: string;
  currentPrice: string | null;
  newPrice: string;
  pointId: string;
  overridden: boolean;
}

interface ImportRow {
  territoryId: string;
  currency: string;
  currentPrice: string | null;
  requested: number;
  snappedPrice: string;
  pointId: string;
  note: string | null;
}

// Bulk import path: ALL territories' price points in one paginated pull
// (limit=8000) instead of 175 per-territory bursts that trip Apple's 429s.
// Price points rarely change — cached for the session.
const allPointsCache = new Map<string, Map<string, AppPricePoint[]>>();

function formatPrice(price: string, currency: string): string {
  const n = Number(price);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      n
    );
  } catch {
    return `${price} ${currency}`;
  }
}

/** Resolve appPrices + included pricePoints/territories into flat rows. */
function resolvePriceRows(
  prices: AppPrice[],
  included: Array<Territory | AppPricePoint>,
  manual: boolean
): PriceRow[] {
  const points = new Map<string, AppPricePoint>();
  const territories = new Map<string, Territory>();
  for (const inc of included) {
    if (inc.type === "appPricePoints") points.set(inc.id, inc as AppPricePoint);
    if (inc.type === "territories") territories.set(inc.id, inc as Territory);
  }
  const rows: PriceRow[] = [];
  for (const price of prices) {
    const pointRef = price.relationships?.appPricePoint?.data;
    const terrRef = price.relationships?.territory?.data;
    if (!pointRef || Array.isArray(pointRef) || !terrRef || Array.isArray(terrRef))
      continue;
    const point = points.get(pointRef.id);
    const territory = territories.get(terrRef.id);
    if (!point) continue;
    rows.push({
      territoryId: terrRef.id,
      currency: territory?.attributes.currency ?? "",
      customerPrice: point.attributes.customerPrice,
      manual,
      pricePointId: point.id,
    });
  }
  return rows;
}

export default function PricingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { credentials } = useCredentials();

  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noSchedule, setNoSchedule] = useState(false);

  const [baseTerritory, setBaseTerritory] = useState<string>("USA");
  const [currentPrices, setCurrentPrices] = useState<PriceRow[]>([]);
  const [search, setSearch] = useState("");

  // "Change price" flow
  const [basePoints, setBasePoints] = useState<AppPricePoint[] | null>(null);
  const [selectedPointId, setSelectedPointId] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  // per-territory override: territoryId -> available points (lazy loaded)
  const [overrideOptions, setOverrideOptions] = useState<
    Record<string, AppPricePoint[]>
  >({});
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  // Sheet import flow
  const [territoriesMap, setTerritoriesMap] = useState<Map<string, string>>(
    new Map()
  );
  const [sheetText, setSheetText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<ImportRow[] | null>(null);
  const [importProgress, setImportProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [keepExistingManual, setKeepExistingManual] = useState(true);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Pro gate + snapshots
  const isPro = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [snapRefresh, setSnapRefresh] = useState(0);

  useEffect(() => setHydrated(true), []);

  // All valid territories + currencies (one cheap fetch, used for validation)
  useEffect(() => {
    if (!credentials || !hydrated) return;
    ascFetchAllFull<Territory>(credentials, "/v1/territories")
      .then(({ data }) =>
        setTerritoriesMap(
          new Map(data.map((t) => [t.id, t.attributes.currency]))
        )
      )
      .catch(() => {});
  }, [credentials, hydrated]);

  const loadCurrent = useCallback(async () => {
    if (!credentials) return;
    setLoading(true);
    setError("");
    try {
      // Does a price schedule exist? (Free apps that never set one → 404)
      let scheduleId: string | null = null;
      try {
        const schedule = await ascFetch<{ data: { id: string } }>(
          credentials,
          `/v1/apps/${id}/appPriceSchedule`
        );
        scheduleId = schedule.data.id;
      } catch (e) {
        if (e instanceof AscError && e.status === 404) {
          setNoSchedule(true);
        } else throw e;
      }

      if (scheduleId) {
        const [base, manualRes, autoRes] = await Promise.all([
          ascFetch<{ data: { id: string } }>(
            credentials,
            `/v1/appPriceSchedules/${scheduleId}/baseTerritory`
          ).catch(() => null),
          ascFetchAllFull<AppPrice, Territory | AppPricePoint>(
            credentials,
            `/v1/appPriceSchedules/${scheduleId}/manualPrices`,
            { include: "appPricePoint,territory" }
          ),
          ascFetchAllFull<AppPrice, Territory | AppPricePoint>(
            credentials,
            `/v1/appPriceSchedules/${scheduleId}/automaticPrices`,
            { include: "appPricePoint,territory" }
          ),
        ]);

        if (base) setBaseTerritory(base.data.id);

        const manualRows = resolvePriceRows(
          manualRes.data,
          manualRes.included,
          true
        );
        const autoRows = resolvePriceRows(autoRes.data, autoRes.included, false);
        // Manual wins over automatic for the same territory
        const byTerritory = new Map<string, PriceRow>();
        for (const r of autoRows) byTerritory.set(r.territoryId, r);
        for (const r of manualRows) byTerritory.set(r.territoryId, r);
        setCurrentPrices(
          [...byTerritory.values()].sort((a, b) =>
            a.territoryId.localeCompare(b.territoryId)
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [credentials, id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!credentials) {
      router.replace("/");
      return;
    }
    loadCurrent();
  }, [hydrated, credentials, router, loadCurrent]);

  // Load price points for the base territory (for the "new price" dropdown)
  useEffect(() => {
    if (!credentials || !hydrated) return;
    ascFetchAllFull<AppPricePoint>(credentials, `/v1/apps/${id}/appPricePoints`, {
      "filter[territory]": baseTerritory,
    })
      .then(({ data }) =>
        setBasePoints(
          data.sort(
            (a, b) =>
              Number(a.attributes.customerPrice) -
              Number(b.attributes.customerPrice)
          )
        )
      )
      .catch(() => setBasePoints([]));
  }, [credentials, hydrated, id, baseTerritory]);

  const currentByTerritory = useMemo(() => {
    const m = new Map<string, PriceRow>();
    for (const r of currentPrices) m.set(r.territoryId, r);
    return m;
  }, [currentPrices]);

  async function buildPreview() {
    if (!credentials || !selectedPointId) return;
    setPreviewing(true);
    setError("");
    setApplied(false);
    try {
      const { data: equalized, included } = await ascFetchAllFull<
        AppPricePoint,
        Territory
      >(credentials, `/v1/appPricePoints/${selectedPointId}/equalizations`, {
        include: "territory",
      });

      const territoryCurrency = new Map<string, string>();
      for (const inc of included) {
        if (inc.type === "territories")
          territoryCurrency.set(inc.id, inc.attributes.currency);
      }

      const rows: PreviewRow[] = [];
      // The selected point itself (base territory)
      const basePoint = basePoints?.find((p) => p.id === selectedPointId);
      if (basePoint) {
        rows.push({
          territoryId: baseTerritory,
          currency:
            currentByTerritory.get(baseTerritory)?.currency ??
            territoryCurrency.get(baseTerritory) ??
            "USD",
          currentPrice:
            currentByTerritory.get(baseTerritory)?.customerPrice ?? null,
          newPrice: basePoint.attributes.customerPrice,
          pointId: basePoint.id,
          overridden: false,
        });
      }
      for (const point of equalized) {
        const terrRef = point.relationships?.territory?.data;
        if (!terrRef || Array.isArray(terrRef)) continue;
        rows.push({
          territoryId: terrRef.id,
          currency: territoryCurrency.get(terrRef.id) ?? "",
          currentPrice:
            currentByTerritory.get(terrRef.id)?.customerPrice ?? null,
          newPrice: point.attributes.customerPrice,
          pointId: point.id,
          overridden: false,
        });
      }
      rows.sort((a, b) => a.territoryId.localeCompare(b.territoryId));
      setPreview(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function loadOverrideOptions(territoryId: string) {
    if (!credentials || overrideOptions[territoryId]) {
      setOverrideOpen(overrideOpen === territoryId ? null : territoryId);
      return;
    }
    setOverrideOpen(territoryId);
    const { data } = await ascFetchAllFull<AppPricePoint>(
      credentials,
      `/v1/apps/${id}/appPricePoints`,
      { "filter[territory]": territoryId }
    );
    setOverrideOptions((o) => ({
      ...o,
      [territoryId]: data.sort(
        (a, b) =>
          Number(a.attributes.customerPrice) -
          Number(b.attributes.customerPrice)
      ),
    }));
  }

  function setOverride(territoryId: string, pointId: string) {
    setPreview((rows) =>
      (rows ?? []).map((r) => {
        if (r.territoryId !== territoryId) return r;
        const point = overrideOptions[territoryId]?.find(
          (p) => p.id === pointId
        );
        if (!point) return r;
        return {
          ...r,
          pointId,
          newPrice: point.attributes.customerPrice,
          overridden: true,
        };
      })
    );
    setOverrideOpen(null);
  }

  /** Save current prices locally before any write — the undo button. */
  function snapshotBeforeApply(label: string) {
    if (currentPrices.length === 0) return;
    takeSnapshot({
      appId: id,
      scope: "app-pricing",
      label,
      baseTerritory,
      rows: currentPrices.map((r) => ({
        territoryId: r.territoryId,
        pricePointId: r.pricePointId,
        customerPrice: r.customerPrice,
        currency: r.currency,
        manual: r.manual,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  /** POST a full replacement price schedule. `manual[0]` must be the base territory's price. */
  async function postSchedule(
    manual: Array<{ pointId: string }>,
    base: string = baseTerritory
  ) {
    if (!credentials) return;
    await ascFetch(credentials, `/v1/appPriceSchedules`, {
      method: "POST",
      body: {
        data: {
          type: "appPriceSchedules",
          relationships: {
            app: { data: { type: "apps", id } },
            baseTerritory: {
              data: { type: "territories", id: base },
            },
            manualPrices: {
              data: manual.map((_, i) => ({
                type: "appPrices",
                id: `\${price-${i}}`,
              })),
            },
          },
        },
        included: manual.map((r, i) => ({
          id: `\${price-${i}}`,
          type: "appPrices",
          attributes: { startDate: null },
          relationships: {
            appPricePoint: {
              data: { type: "appPricePoints", id: r.pointId },
            },
          },
        })),
      },
    });
  }

  async function applySchedule() {
    if (!credentials || !preview) return;
    const overrides = preview.filter((r) => r.overridden);
    const base = preview.find((r) => r.territoryId === baseTerritory);
    if (!base) {
      setError("Base territory price missing from preview.");
      return;
    }
    setApplying(true);
    setError("");
    try {
      snapshotBeforeApply(
        `Before base-price change → ${formatPrice(base.newPrice, base.currency)}`
      );
      await postSchedule([
        base,
        ...overrides.filter((r) => r.territoryId !== baseTerritory),
      ]);
      setApplied(true);
      setPreview(null);
      setSelectedPointId("");
      setNoSchedule(false);
      await loadCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  /** Restore a snapshot: re-POST its manual prices exactly as they were. */
  async function restoreSnapshot(snapshot: PriceSnapshot) {
    if (!credentials) return;
    const base = snapshot.baseTerritory ?? baseTerritory;
    const baseRow = snapshot.rows.find((r) => r.territoryId === base);
    if (!baseRow) {
      setError("Snapshot is missing its base territory — can't restore.");
      return;
    }
    setApplying(true);
    setError("");
    try {
      snapshotBeforeApply("Before restore (auto-safety)");
      const manualRows = snapshot.rows.filter(
        (r) => r.manual && r.territoryId !== base
      );
      await postSchedule(
        [
          { pointId: baseRow.pricePointId },
          ...manualRows.map((r) => ({ pointId: r.pricePointId })),
        ],
        base
      );
      setApplied(true);
      setNoSchedule(false);
      await loadCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  /** Fetch ALL price points for the app in one paginated pull, grouped by territory. */
  async function loadAllPricePoints(): Promise<Map<string, AppPricePoint[]>> {
    const cached = allPointsCache.get(id);
    if (cached) return cached;
    const { data } = await ascFetchAllFull<AppPricePoint>(
      credentials!,
      `/v1/apps/${id}/appPricePoints`,
      { include: "territory", limit: "8000" }
    );
    const byTerritory = new Map<string, AppPricePoint[]>();
    for (const p of data) {
      const terrRef = p.relationships?.territory?.data;
      if (!terrRef || Array.isArray(terrRef)) continue;
      const arr = byTerritory.get(terrRef.id) ?? [];
      arr.push(p);
      byTerritory.set(terrRef.id, arr);
    }
    allPointsCache.set(id, byTerritory);
    return byTerritory;
  }

  async function buildImportPreview() {
    if (!credentials || !sheetText.trim()) return;
    setError("");
    setApplied(false);
    setImportPreview(null);

    const { rows, warnings } = parsePriceSheet(sheetText);
    const allWarnings = [...warnings];

    const valid = rows.filter((r) => {
      if (territoriesMap.size > 0 && !territoriesMap.has(r.territoryId)) {
        allWarnings.push(
          `${r.territoryId}: not an App Store territory — skipped`
        );
        return false;
      }
      return true;
    });

    setImportWarnings(allWarnings);
    if (valid.length === 0) {
      setError("No usable rows found. Expected CSV: territory,price (3-letter codes like USA, EGY).");
      return;
    }

    setImportProgress({ done: 0, total: valid.length });
    try {
      // One bulk fetch for every territory's price points (cached per app)
      const pointsByTerritory = await loadAllPricePoints();

      const resolved = valid.map((row) => {
        const points = pointsByTerritory.get(row.territoryId) ?? [];
        const point = snapToPricePoint(points, row.price);
        if (!point) {
          allWarnings.push(
            `${row.territoryId}: no price points available — skipped`
          );
          return null;
        }
        const snapped = point.attributes.customerPrice;
        const wasSnapped = Number(snapped) !== row.price;
        return {
          territoryId: row.territoryId,
          currency: territoriesMap.get(row.territoryId) ?? "",
          currentPrice:
            currentByTerritory.get(row.territoryId)?.customerPrice ?? null,
          requested: row.price,
          snappedPrice: snapped,
          pointId: point.id,
          note: wasSnapped ? `snapped from ${row.price}` : null,
        } satisfies ImportRow;
      });
      setImportPreview(
        resolved
          .filter((r): r is ImportRow => r !== null)
          .sort((a, b) => a.territoryId.localeCompare(b.territoryId))
      );
      setImportWarnings([...allWarnings]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportProgress(null);
    }
  }

  async function applyImport() {
    if (!credentials || !importPreview) return;
    setApplying(true);
    setError("");
    try {
      const inSheet = new Map(importPreview.map((r) => [r.territoryId, r]));

      // Base territory price is required: from the sheet, or current schedule
      let basePointId = inSheet.get(baseTerritory)?.pointId;
      if (!basePointId) {
        basePointId = currentByTerritory.get(baseTerritory)?.pricePointId;
      }
      if (!basePointId) {
        setError(
          `Include your base territory (${baseTerritory}) in the sheet — there's no current base price to keep.`
        );
        setApplying(false);
        return;
      }

      const manual: Array<{ pointId: string }> = [{ pointId: basePointId }];
      for (const row of importPreview) {
        if (row.territoryId === baseTerritory) continue;
        manual.push({ pointId: row.pointId });
      }
      // Preserve manual prices Apple already has that the sheet doesn't touch
      if (keepExistingManual) {
        for (const row of currentPrices) {
          if (!row.manual) continue;
          if (row.territoryId === baseTerritory) continue;
          if (inSheet.has(row.territoryId)) continue;
          manual.push({ pointId: row.pricePointId });
        }
      }

      snapshotBeforeApply(`Before sheet import · ${importPreview.length} territories`);
      await postSchedule(manual);
      setApplied(true);
      setImportPreview(null);
      setSheetText("");
      setNoSchedule(false);
      await loadCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function exportCsv() {
    const csv = buildCsv(currentPrices);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prices-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAiPrompt() {
    await navigator.clipboard.writeText(buildAiPrompt(buildCsv(currentPrices)));
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  const filteredPrices = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return currentPrices;
    return currentPrices.filter(
      (r) => r.territoryId.includes(q) || r.currency.includes(q)
    );
  }, [currentPrices, search]);

  const overrideCount = preview?.filter((r) => r.overridden).length ?? 0;

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-5xl mx-auto w-full px-6 py-10">
      <TopBar backToApps />

      <AppTabs appId={id} active="pricing" />

      <h1 className="text-xl font-bold mb-1">Pricing matrix</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Set a base price, preview all {currentPrices.length > 0 ? currentPrices.length : "~175"}{" "}
        storefronts, override only the countries you want. One apply — instead
        of an afternoon in ASC.
      </p>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {applied && (
        <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mb-4">
          ✓ Price schedule applied. That just saved you ~30 minutes of clicking.
        </p>
      )}

      {/* ---- Sheet import flow ---- */}
      <div className="card card-hero p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-semibold">
            Import price sheet{" "}
            <span className="text-zinc-500 font-normal text-sm">
              CSV from any AI or spreadsheet
            </span>
          </h2>
          <div className="flex gap-2">
            <button
              onClick={exportCsv}
              disabled={currentPrices.length === 0}
              className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-40 transition"
            >
              ↓ Export current CSV
            </button>
            <button
              onClick={copyAiPrompt}
              disabled={currentPrices.length === 0}
              className="text-xs rounded-md border border-emerald-800 px-3 py-1.5 text-emerald-400 hover:border-emerald-600 disabled:opacity-40 transition"
            >
              {copiedPrompt ? "Copied ✓" : "⧉ Copy AI prompt + my prices"}
            </button>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-3">
          The loop: export → ask ChatGPT/Claude to reprice (PPP, sales,
          rounding — your call) → paste the CSV back here. We snap every price
          to the nearest valid Apple price point and show you the diff first.
        </p>
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
              id="csv-file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setSheetText(await f.text());
                  setImportPreview(null);
                }
              }}
            />
            <button
              onClick={() => document.getElementById("csv-file")?.click()}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 transition"
            >
              Upload .csv
            </button>
          </label>
          <button
            onClick={buildImportPreview}
            disabled={!sheetText.trim() || importProgress !== null}
            className="rounded-md bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {importProgress
              ? allPointsCache.has(id)
                ? "Snapping prices…"
                : "Loading Apple price tiers (one-time)…"
              : "Preview import"}
          </button>
          {importPreview && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={keepExistingManual}
                  onChange={(e) => setKeepExistingManual(e.target.checked)}
                  className="accent-emerald-500"
                />
                Keep existing manual prices not in the sheet
              </label>
              <button
                onClick={() => (isPro ? applyImport() : setPaywallOpen(true))}
                disabled={applying || applied}
                className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:shadow-none transition"
              >
                {applying
                  ? "Applying…"
                  : applied
                    ? `✓ Applied — start a new import to change again`
                    : isPro
                      ? `Apply ${importPreview.length} prices`
                      : `🔒 Apply ${importPreview.length} prices`}
              </button>
            </>
          )}
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
                      <td className="px-4 py-2 font-mono text-zinc-300">
                        {r.territoryId}
                        {r.territoryId === baseTerritory && (
                          <span className="ml-2 text-xs text-emerald-400">base</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 font-mono">
                        {r.currentPrice !== null
                          ? formatPrice(r.currentPrice, r.currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 font-mono">
                        {r.requested}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {formatPrice(r.snappedPrice, r.currency)}
                        {r.note && (
                          <span className="ml-2 text-xs text-amber-400">
                            {r.note}
                          </span>
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

      {/* ---- Change price flow ---- */}
      <div className="card p-5 mb-8">
        <h2 className="font-semibold mb-3">
          New price{" "}
          <span className="text-zinc-500 font-normal text-sm">
            (base: {baseTerritory})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedPointId}
            onChange={(e) => {
              setSelectedPointId(e.target.value);
              setPreview(null);
            }}
            className="rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono min-w-40"
          >
            <option value="">
              {basePoints === null ? "Loading price points…" : "Select price…"}
            </option>
            {basePoints?.map((p) => (
              <option key={p.id} value={p.id}>
                {formatPrice(
                  p.attributes.customerPrice,
                  currentByTerritory.get(baseTerritory)?.currency ?? "USD"
                )}
              </option>
            ))}
          </select>
          <button
            onClick={buildPreview}
            disabled={!selectedPointId || previewing}
            className="rounded-md bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {previewing ? "Building preview…" : "Preview all territories"}
          </button>
          {preview && (
            <button
              onClick={() => (isPro ? applySchedule() : setPaywallOpen(true))}
              disabled={applying || applied}
              className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:shadow-none transition"
            >
              {applying
                ? "Applying…"
                : applied
                  ? `✓ Applied — preview again to make further changes`
                  : `${isPro ? "" : "🔒 "}Apply to ${preview.length} territories${overrideCount > 0 ? ` (${overrideCount} overridden)` : ""}`}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Nothing is written to Apple until you hit Apply. Preview is a dry
          run.
        </p>
      </div>

      {/* ---- Preview table ---- */}
      {preview && (
        <div className="mb-8">
          <h2 className="font-semibold mb-3">
            Preview{" "}
            <span className="text-zinc-500 font-normal text-sm">
              {preview.length} territories — click Override on any row to
              fine-tune that country
            </span>
          </h2>
          <div className="rounded-xl border border-zinc-800 overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="text-left text-zinc-400">
                    <th className="px-4 py-2 font-medium">Territory</th>
                    <th className="px-4 py-2 font-medium">Current</th>
                    <th className="px-4 py-2 font-medium">New</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr
                      key={r.territoryId}
                      className={`border-t border-zinc-800/60 ${
                        r.overridden ? "bg-emerald-950/20" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-zinc-300">
                        {r.territoryId}
                        {r.territoryId === baseTerritory && (
                          <span className="ml-2 text-xs text-emerald-400">
                            base
                          </span>
                        )}
                        {r.overridden && (
                          <span className="ml-2 text-xs text-emerald-400">
                            override
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-zinc-500 font-mono">
                        {r.currentPrice !== null
                          ? formatPrice(r.currentPrice, r.currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono">
                        {formatPrice(r.newPrice, r.currency)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.territoryId !== baseTerritory && (
                          <div className="relative inline-block">
                            <button
                              onClick={() => loadOverrideOptions(r.territoryId)}
                              className="text-xs text-zinc-400 hover:text-emerald-400"
                            >
                              Override ▾
                            </button>
                            {overrideOpen === r.territoryId && (
                              <div className="absolute right-0 z-10 mt-1 w-44 max-h-48 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-xl">
                                {!overrideOptions[r.territoryId] ? (
                                  <p className="px-3 py-2 text-xs text-zinc-500">
                                    Loading…
                                  </p>
                                ) : (
                                  overrideOptions[r.territoryId].map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() =>
                                        setOverride(r.territoryId, p.id)
                                      }
                                      className={`block w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-zinc-800 ${
                                        p.id === r.pointId
                                          ? "text-emerald-400"
                                          : "text-zinc-300"
                                      }`}
                                    >
                                      {formatPrice(
                                        p.attributes.customerPrice,
                                        r.currency
                                      )}
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---- Snapshots ---- */}
      <SnapshotPanel
        appId={id}
        scope="app-pricing"
        refreshKey={snapRefresh}
        onRestore={restoreSnapshot}
        busy={applying}
      />

      {/* ---- Current prices ---- */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Current prices</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter: USA, EGY, EUR…"
          className="rounded-md bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm w-48 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {loading && (
        <p className="text-zinc-400 animate-pulse">Loading prices…</p>
      )}

      {!loading && noSchedule && currentPrices.length === 0 && (
        <p className="text-zinc-400 text-sm rounded-md border border-zinc-800 bg-zinc-900/40 px-4 py-3">
          No price schedule found — this app is likely free or has never had a
          price set. Pick a price above to create one.
        </p>
      )}

      {!loading && currentPrices.length > 0 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="text-left text-zinc-400">
                  <th className="px-4 py-2 font-medium">Territory</th>
                  <th className="px-4 py-2 font-medium">Currency</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrices.map((r) => (
                  <tr key={r.territoryId} className="border-t border-zinc-800/60">
                    <td className="px-4 py-2 font-mono text-zinc-300">
                      {r.territoryId}
                      {r.territoryId === baseTerritory && (
                        <span className="ml-2 text-xs text-emerald-400">
                          base
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{r.currency}</td>
                    <td className="px-4 py-2 font-mono">
                      {formatPrice(r.customerPrice, r.currency)}
                    </td>
                    <td className="px-4 py-2 text-xs text-zinc-500">
                      {r.manual ? (
                        <span className="text-emerald-400">manual</span>
                      ) : (
                        "equalized"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </main>
  );
}
