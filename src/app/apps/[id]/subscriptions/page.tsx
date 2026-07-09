"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch, ascFetchAllFull, AscError } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
import { PaywallModal } from "@/components/Paywall";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { TopBar } from "@/components/TopBar";
import { useIsPro } from "@/lib/license";
import { takeSnapshot, type PriceSnapshot } from "@/lib/snapshots";
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

// One bulk fetch per subscription: all price points for ALL territories
// (~18 pages at limit=8000) instead of 175 per-territory request bursts
// that trip Apple's rate limiter. Cached for the session.
const allPointsCache = new Map<string, Map<string, SubscriptionPricePoint[]>>();

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
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [applied, setApplied] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

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

  /** Fetch ALL price points for the subscription in one paginated pull, grouped by territory. */
  async function loadAllPricePoints(): Promise<Map<string, SubscriptionPricePoint[]>> {
    const cached = allPointsCache.get(selectedSubId);
    if (cached) return cached;
    const { data } = await ascFetchAllFull<SubscriptionPricePoint>(
      credentials!,
      `/v1/subscriptions/${selectedSubId}/pricePoints`,
      { include: "territory", limit: "8000" }
    );
    const byTerritory = new Map<string, SubscriptionPricePoint[]>();
    for (const p of data) {
      const terrRef = p.relationships?.territory?.data;
      if (!terrRef || Array.isArray(terrRef)) continue;
      const arr = byTerritory.get(terrRef.id) ?? [];
      arr.push(p);
      byTerritory.set(terrRef.id, arr);
    }
    allPointsCache.set(selectedSubId, byTerritory);
    return byTerritory;
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
    try {
      // One bulk fetch for every territory's price points (cached per subscription)
      const pointsByTerritory = await loadAllPricePoints();

      const resolved = valid.map((row) => {
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
        return {
          territoryId: row.territoryId,
          currency: territoriesMap.get(row.territoryId) ?? "",
          currentPrice: activePrices.find((r) => r.territoryId === row.territoryId)?.customerPrice ?? null,
          requested: row.price,
          snappedPrice,
          pointId: snapped.id,
          note: wasSnapped ? `snapped from ${row.price}` : null,
        } satisfies SubImportRow;
      });
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

  /** Save current active prices locally before any write — the undo button. */
  function snapshotBeforeApply(label: string) {
    if (activePrices.length === 0 || !selectedSubId) return;
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

  /**
   * Write prices to Apple: per territory, cancel any FUTURE scheduled price
   * (current/historical entries 409 on DELETE), then POST the new price.
   */
  async function postPrices(
    rows: Array<{ territoryId: string; pointId: string }>
  ) {
    if (!credentials || !selectedSubId) return;
    let done = 0;
    const BATCH = 4;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await Promise.all(
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
              await ascFetch(credentials, `/v1/subscriptionPrices/${e.priceId}`, {
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
          await ascFetch(credentials, `/v1/subscriptionPrices`, {
            method: "POST",
            body: {
              data: {
                type: "subscriptionPrices",
                attributes: {
                  startDate,
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
          setApplying({ done, total: rows.length });
        })
      );
    }
  }

  async function applyImport() {
    if (!credentials || !importPreview || !selectedSubId) return;
    setError("");
    setApplying({ done: 0, total: importPreview.length });
    try {
      snapshotBeforeApply(`Before sheet import · ${importPreview.length} territories`);
      await postPrices(
        importPreview.map((r) => ({ territoryId: r.territoryId, pointId: r.pointId }))
      );
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

  /** Restore a snapshot: re-POST every territory's old price point. */
  async function restoreSnapshot(snapshot: PriceSnapshot) {
    if (!credentials || !selectedSubId) return;
    setError("");
    setApplying({ done: 0, total: snapshot.rows.length });
    try {
      snapshotBeforeApply("Before restore (auto-safety)");
      await postPrices(
        snapshot.rows.map((r) => ({ territoryId: r.territoryId, pointId: r.pricePointId }))
      );
      setApplied(true);
      await loadPrices(selectedSubId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  async function copyAiPrompt() {
    const rows = activePrices.map((r) => ({
      territoryId: r.territoryId,
      currency: r.currency,
      customerPrice: r.customerPrice,
    }));
    await navigator.clipboard.writeText(buildAiPrompt(buildCsv(rows)));
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
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
        Set prices per territory for each subscription. The AI loop works the same way — export, reprice with AI, paste back.
      </p>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {applied && (
        <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-md px-3 py-2 mb-4">
          ✓ Subscription prices updated. Existing subscribers are grandfathered at their current price by Apple — only new subscribers see the new tier.
        </p>
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
          <div className="max-w-md">
            <input
              list="sub-list"
              value={
                subscriptions.find((s) => s.id === selectedSubId)
                  ? `${subscriptions.find((s) => s.id === selectedSubId)!.attributes.name} — ${formatPeriod(
                      subscriptions.find((s) => s.id === selectedSubId)!.attributes.subscriptionPeriod
                    )} · ${subscriptions.find((s) => s.id === selectedSubId)!.attributes.productId}`
                  : ""
              }
              onChange={(e) => {
                const text = e.target.value;
                const found = subscriptions.find(
                  (s) =>
                    `${s.attributes.name} — ${formatPeriod(s.attributes.subscriptionPeriod)} · ${s.attributes.productId}` ===
                    text
                );
                if (found) setSelectedSubId(found.id);
              }}
              placeholder="Choose a subscription…  (type to search)"
              className="w-full rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <datalist id="sub-list">
              {subscriptions.map((s) => (
                <option
                  key={s.id}
                  value={`${s.attributes.name} — ${formatPeriod(s.attributes.subscriptionPeriod)} · ${s.attributes.productId}`}
                />
              ))}
            </datalist>
            {selectedSubId && subscriptions.length > 1 && (
              <p className="mt-1.5 text-xs text-zinc-500">
                Selected:{" "}
                <span className="text-zinc-300 font-mono">
                  {subscriptions.find((s) => s.id === selectedSubId)?.attributes.productId}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      {selectedSubId && (
        <>
          {/* Import sheet */}
          <div className="card card-hero p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-semibold">
                Import price sheet{" "}
                <span className="text-zinc-500 font-normal text-sm">CSV from any AI or spreadsheet</span>
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={exportCsv}
                  disabled={activePrices.length === 0}
                  className="text-xs rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-40 transition"
                >
                  ↓ Export current CSV
                </button>
                <button
                  onClick={copyAiPrompt}
                  disabled={activePrices.length === 0}
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
                  ? allPointsCache.has(selectedSubId)
                    ? "Snapping prices…"
                    : "Loading Apple price tiers (one-time per subscription)…"
                  : "Preview import"}
              </button>

              {importPreview && (
                  !applied ? (
                  <button
                    onClick={() => (isPro ? applyImport() : setPaywallOpen(true))}
                    disabled={applying !== null}
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
                <p className="mt-2 text-xs text-zinc-400 flex items-start gap-1.5">
                  <span className="text-emerald-500 mt-px" aria-hidden>✓</span>
                  <span>
                    Existing subscribers are <strong className="text-zinc-300 font-medium">always grandfathered</strong> by Apple — they keep the tier they paid for until they cancel/renew. Only new subscribers see the new price.
                  </span>
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

          {/* Snapshots */}
          <SnapshotPanel
            appId={id}
            scope={`sub:${selectedSubId}`}
            refreshKey={snapRefresh}
            onRestore={restoreSnapshot}
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

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </main>
  );
}
