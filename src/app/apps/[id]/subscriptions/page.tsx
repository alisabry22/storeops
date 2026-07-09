"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch, ascFetchAllFull } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
import { buildAiPrompt, buildCsv, parsePriceSheet, snapToPricePoint } from "@/lib/pricing-import";
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
}

const pricePointCache = new Map<string, SubscriptionPricePoint[]>();

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
    });
  }
  return rows;
}

export default function SubscriptionsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { credentials } = useCredentials();

  const [hydrated, setHydrated] = useState(false);
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
  const [preserveExisting, setPreserveExisting] = useState(true);
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => setHydrated(true), []);

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
    setLoadingGroups(true);
    setError("");

    (async () => {
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
    })();
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
      const rows = resolvePrices(data, included);
      setCurrentPrices(rows.sort((a, b) => a.territoryId.localeCompare(b.territoryId)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPrices(false);
    }
  }, [credentials]);

  useEffect(() => {
    if (selectedSubId) {
      setImportPreview(null);
      setSheetText("");
      setApplied(false);
      loadPrices(selectedSubId);
    }
  }, [selectedSubId, loadPrices]);

  // A territory can have multiple entries (current price + scheduled future price)
  const currentByTerritory = useMemo(() => {
    const m = new Map<string, SubPriceRow[]>();
    for (const r of currentPrices) {
      const arr = m.get(r.territoryId) ?? [];
      arr.push(r);
      m.set(r.territoryId, arr);
    }
    return m;
  }, [currentPrices]);

  async function getPricePoints(territoryId: string): Promise<SubscriptionPricePoint[]> {
    const key = `${selectedSubId}:${territoryId}`;
    const cached = pricePointCache.get(key);
    if (cached) return cached;
    const { data } = await ascFetchAllFull<SubscriptionPricePoint>(
      credentials!,
      `/v1/subscriptions/${selectedSubId}/pricePoints`,
      { "filter[territory]": territoryId }
    );
    pricePointCache.set(key, data);
    return data;
  }

  async function buildImportPreview() {
    if (!credentials || !sheetText.trim() || !selectedSubId) return;
    setError("");
    setApplied(false);
    setImportPreview(null);

    const { rows, warnings } = parsePriceSheet(sheetText);
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

    setImportProgress({ done: 0, total: valid.length });
    let done = 0;
    try {
      const resolved = await Promise.all(
        valid.map(async (row) => {
          const points = await getPricePoints(row.territoryId);
          done++;
          setImportProgress({ done, total: valid.length });
          const snapped = snapToPricePoint(points, row.price);
          if (!snapped) {
            allWarnings.push(`${row.territoryId}: no price points available — skipped`);
            return null;
          }
          const snappedPrice = snapped.attributes.customerPrice;
          const wasSnapped = Number(snappedPrice) !== row.price;
          return {
            territoryId: row.territoryId,
            currency: territoriesMap.get(row.territoryId) ?? "",
            currentPrice: currentByTerritory.get(row.territoryId)?.[0]?.customerPrice ?? null,
            requested: row.price,
            snappedPrice,
            pointId: snapped.id,
            note: wasSnapped ? `snapped from ${row.price}` : null,
          } satisfies SubImportRow;
        })
      );
      setImportPreview(
        resolved
          .filter((r): r is SubImportRow => r !== null)
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
    if (!credentials || !importPreview || !selectedSubId) return;
    setError("");
    setApplying({ done: 0, total: importPreview.length });

    let done = 0;

    try {
      // Process in batches of 4 (mirrors rate-limit queue)
      const BATCH = 4;
      for (let i = 0; i < importPreview.length; i += BATCH) {
        const batch = importPreview.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (row) => {
            // Delete ALL existing prices for this territory (current + any scheduled)
            const existing = currentByTerritory.get(row.territoryId) ?? [];
            for (const e of existing) {
              await ascFetch(credentials, `/v1/subscriptionPrices/${e.priceId}`, {
                method: "DELETE",
              });
            }
            // Create new price
            await ascFetch(credentials, `/v1/subscriptionPrices`, {
              method: "POST",
              body: {
                data: {
                  type: "subscriptionPrices",
                  attributes: {
                    startDate: null,
                    preserveCurrentLocalizedPrices: preserveExisting,
                  },
                  relationships: {
                    subscription: { data: { type: "subscriptions", id: selectedSubId } },
                    subscriptionPricePoint: { data: { type: "subscriptionPricePoints", id: row.pointId } },
                    territory: { data: { type: "territories", id: row.territoryId } },
                  },
                },
              },
            });
            done++;
            setApplying({ done, total: importPreview.length });
          })
        );
      }

      setApplied(true);
      setImportPreview(null);
      setSheetText("");
      await loadPrices(selectedSubId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(null);
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
    const subName = subscriptions.find((s) => s.id === selectedSubId)?.attributes.name ?? selectedSubId;
    a.download = `sub-prices-${subName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAiPrompt() {
    const rows = currentPrices.map((r) => ({
      territoryId: r.territoryId,
      currency: r.currency,
      customerPrice: r.customerPrice,
    }));
    await navigator.clipboard.writeText(buildAiPrompt(buildCsv(rows)));
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  const filteredPrices = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return currentPrices;
    return currentPrices.filter((r) => r.territoryId.includes(q) || r.currency.includes(q));
  }, [currentPrices, search]);

  const selectedSub = subscriptions.find((s) => s.id === selectedSubId);

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-5xl mx-auto w-full px-6 py-10">
      <div className="flex items-center gap-3 mb-6 text-sm text-zinc-400">
        <Link href="/apps" className="hover:text-zinc-200">← Apps</Link>
      </div>

      <AppTabs appId={id} active="subscriptions" />

      <h1 className="text-xl font-bold mb-1">Subscription pricing</h1>
      <p className="text-sm text-zinc-400 mb-6">
        Set prices per territory for each subscription. The AI loop works the same way — export, reprice with AI, paste back.
      </p>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {applied && (
        <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mb-4">
          ✓ Subscription prices updated. Existing subscribers are {preserveExisting ? "protected — they keep their current price" : "moved to the new price"}.
        </p>
      )}

      {/* Subscription selector */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 mb-6">
        <h2 className="font-semibold mb-3">Select subscription</h2>
        {loadingGroups ? (
          <p className="text-sm text-zinc-400 animate-pulse">Loading subscriptions…</p>
        ) : subscriptions.length === 0 ? (
          <p className="text-sm text-zinc-400">No subscriptions found for this app.</p>
        ) : (
          <select
            value={selectedSubId}
            onChange={(e) => setSelectedSubId(e.target.value)}
            className="rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-72"
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
          <div className="rounded-xl border border-emerald-900/60 bg-zinc-900/60 p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold">
                Import price sheet{" "}
                <span className="text-zinc-500 font-normal text-sm">CSV from any AI or spreadsheet</span>
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
              Export → reprice with AI → paste back. Prices snap to valid Apple subscription tiers.
              Existing subscribers are protected by default.
            </p>

            <textarea
              value={sheetText}
              onChange={(e) => { setSheetText(e.target.value); setImportPreview(null); }}
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
                    if (f) { setSheetText(await f.text()); setImportPreview(null); }
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
                onClick={buildImportPreview}
                disabled={!sheetText.trim() || importProgress !== null}
                className="rounded-md bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-semibold hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {importProgress
                  ? `Validating ${importProgress.done}/${importProgress.total}…`
                  : "Preview import"}
              </button>

              {importPreview && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={preserveExisting}
                      onChange={(e) => setPreserveExisting(e.target.checked)}
                      className="accent-emerald-500"
                    />
                    Protect existing subscribers (keep their current price)
                  </label>
                  <button
                    onClick={applyImport}
                    disabled={applying !== null}
                    className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
                  >
                    {applying !== null
                      ? `Applying ${applying.done}/${applying.total}…`
                      : `Apply ${importPreview.length} prices`}
                  </button>
                </>
              )}
            </div>

            {!preserveExisting && importPreview && (
              <p className="mt-2 text-xs text-amber-400 bg-amber-950/30 border border-amber-900 rounded-md px-3 py-2">
                Warning: existing subscribers will be moved to the new price on their next renewal.
              </p>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Current prices */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              Current prices
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

          {!loadingPrices && currentPrices.length > 0 && (
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-left text-zinc-400">
                      <th className="px-4 py-2 font-medium">Territory</th>
                      <th className="px-4 py-2 font-medium">Currency</th>
                      <th className="px-4 py-2 font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrices.map((r) => (
                      <tr key={r.priceId} className="border-t border-zinc-800/60">
                        <td className="px-4 py-2 font-mono text-zinc-300">{r.territoryId}</td>
                        <td className="px-4 py-2 text-zinc-500">{r.currency}</td>
                        <td className="px-4 py-2 font-mono">{formatPrice(r.customerPrice, r.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
