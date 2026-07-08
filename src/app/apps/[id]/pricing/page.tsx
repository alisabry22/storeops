"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { AscError, ascFetch, ascFetchAllFull } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
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

  useEffect(() => setHydrated(true), []);

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
      const manual = [base, ...overrides.filter((r) => r.territoryId !== baseTerritory)];
      await ascFetch(credentials, `/v1/appPriceSchedules`, {
        method: "POST",
        body: {
          data: {
            type: "appPriceSchedules",
            relationships: {
              app: { data: { type: "apps", id } },
              baseTerritory: {
                data: { type: "territories", id: baseTerritory },
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
      <div className="flex items-center gap-3 mb-6 text-sm text-zinc-400">
        <Link href="/apps" className="hover:text-zinc-200">
          ← Apps
        </Link>
      </div>

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

      {/* ---- Change price flow ---- */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mb-8">
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
              onClick={applySchedule}
              disabled={applying}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
            >
              {applying
                ? "Applying…"
                : `Apply to ${preview.length} territories${overrideCount > 0 ? ` (${overrideCount} overridden)` : ""}`}
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
    </main>
  );
}
