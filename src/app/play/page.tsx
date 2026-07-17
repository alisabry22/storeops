"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PaywallModal } from "@/components/Paywall";
import { RequireAccount } from "@/components/RequireAccount";
import { SnapshotConfirmDialog } from "@/components/SnapshotConfirmDialog";
import { ApplySuccessDialog } from "@/components/ApplySuccessDialog";
import { UpdateStatus } from "@/components/UpdateStatus";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { useIsPro } from "@/lib/license";
import { takeSnapshot, type PriceSnapshot } from "@/lib/snapshots";
import { buildCsv, parsePriceSheet } from "@/lib/pricing-import";
import {
  STRATEGIES,
  type PricingStrategy,
  getStrategy,
} from "@/lib/pricing-strategies";
import { generateControlledPriceCsv } from "@/lib/pricing-policy";
import { storeServiceAccount } from "@/lib/gp/auth";
import { gpFetch, GpError } from "@/lib/gp/client";
import { useGpStore } from "@/lib/gp/store";
import {
  decimalToMicros,
  decimalToMoney,
  microsToDecimal,
  moneyToDecimal,
  requiredCurrency,
  GP_NOT_BILLABLE,
  GP_USD_PRICE_CAPS,
  type GpInAppProduct,
  type GpOneTimeProduct,
  type GpPriceRow,
  type GpSubscription,
} from "@/lib/gp/types";

const API = "/androidpublisher/v3/applications";

/**
 * Normalized one-time product. Bridges the legacy /inappproducts shape
 * (micros, `prices: Record<region, {priceMicros, currency}>`) and the new
 * /oneTimeProducts shape (Money objects nested under purchaseOptions[].…).
 * Downstream code only touches `productId`, `title`, and `prices` (already
 * decimal-normalized). The apply path branches on `legacy` and uses the raw
 * shape it needs to send back to Google.
 */
type IapProduct = {
  legacy: boolean;
  productId: string;
  title: string;
  prices: GpPriceRow[];
  purchaseOptionId?: string; // modern only — which purchase option holds the prices
  legacyRaw?: GpInAppProduct;
  modernRaw?: GpOneTimeProduct;
};

/** Unified product selector: one-time products and subscription base plans. */
type ProductRef =
  | { kind: "iap"; productId: string; title: string }
  | { kind: "sub"; productId: string; basePlanId: string; title: string };

function refKey(r: ProductRef): string {
  return r.kind === "iap"
    ? `iap:${r.productId}`
    : `sub:${r.productId}:${r.basePlanId}`;
}

function refLabel(r: ProductRef): string {
  return r.kind === "iap"
    ? `${r.title} · one-time · ${r.productId}`
    : `${r.title} · base plan · ${r.productId}/${r.basePlanId}`;
}

interface GpImportRow {
  regionCode: string;
  currency: string;
  currentPrice: string;
  newPrice: string;
}

function formatPrice(price: string, currency: string): string {
  const n = Number(price);
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      n,
    );
  } catch {
    return `${price} ${currency}`;
  }
}

export default function PlayPage() {
  const {
    gpCredentials,
    packages,
    setGpCredentials,
    clearGpCredentials,
    addPackage,
    removePackage,
  } = useGpStore();

  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");

  // Connect flow
  const [connecting, setConnecting] = useState(false);

  // Package + products
  const [newPackage, setNewPackage] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [iaps, setIaps] = useState<IapProduct[]>([]);
  const [subs, setSubs] = useState<GpSubscription[]>([]);
  const [selectedRefKey, setSelectedRefKey] = useState("");

  // Import flow
  const [sheetText, setSheetText] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [importPreview, setImportPreview] = useState<GpImportRow[] | null>(
    null,
  );
  const [applying, setApplying] = useState(false);
  const [applySummary, setApplySummary] = useState<{
    productLabel: string;
    regionsChanged: number;
    warnings: string[];
  } | null>(null);
  const [strategy, setStrategy] = useState<PricingStrategy>("ppp");
  const [search, setSearch] = useState("");

  // Pro gate + snapshots
  const isPro = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [snapRefresh, setSnapRefresh] = useState(0);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (packages.length === 1) setSelectedPackage(packages[0]);
  }, [packages]);

  const productRefs = useMemo<ProductRef[]>(() => {
    const refs: ProductRef[] = [];
    for (const p of iaps) {
      refs.push({
        kind: "iap",
        productId: p.productId,
        title: p.title,
      });
    }
    for (const s of subs) {
      if (s.archived) continue;
      for (const bp of s.basePlans ?? []) {
        refs.push({
          kind: "sub",
          productId: s.productId,
          basePlanId: bp.basePlanId,
          title: s.listings?.[0]?.title ?? s.productId,
        });
      }
    }
    return refs;
  }, [iaps, subs]);

  const selectedRef =
    productRefs.find((r) => refKey(r) === selectedRefKey) ?? null;

  /** Current region prices for the selected product. */
  const currentPrices = useMemo<GpPriceRow[]>(() => {
    if (!selectedRef) return [];
    if (selectedRef.kind === "iap") {
      const product = iaps.find((p) => p.productId === selectedRef.productId);
      if (!product) return [];
      return product.prices
        .slice()
        .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
    }
    const sub = subs.find((s) => s.productId === selectedRef.productId);
    const plan = sub?.basePlans?.find(
      (b) => b.basePlanId === selectedRef.basePlanId,
    );
    if (!plan?.regionalConfigs) return [];
    return plan.regionalConfigs
      .filter((rc) => rc.price)
      .map((rc) => ({
        regionCode: rc.regionCode,
        currency: rc.price!.currencyCode,
        price: moneyToDecimal(rc.price!),
      }))
      .sort((a, b) => a.regionCode.localeCompare(b.regionCode));
  }, [selectedRef, iaps, subs]);

  const currentByRegion = useMemo(() => {
    const m = new Map<string, GpPriceRow>();
    for (const r of currentPrices) m.set(r.regionCode, r);
    return m;
  }, [currentPrices]);

  const snapshotScope = selectedRef ? `gp:${refKey(selectedRef)}` : "";

  async function connect(json: string) {
    setConnecting(true);
    setError("");
    try {
      const creds = await storeServiceAccount(json);
      setGpCredentials(creds);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  const loadProducts = useCallback(async () => {
    if (!gpCredentials || !selectedPackage) return;
    setLoadingProducts(true);
    setError("");
    setIaps([]);
    setSubs([]);
    setSelectedRefKey("");
    // --- One-time products (IAPs) ---
    // Google migrated apps to a new monetization API. Migrated apps reject
    // /inappproducts with 403 "Please migrate to the new publishing API" and
    // expose the data at /oneTimeProducts instead. Try the new endpoint first
    // and fall back to the legacy path on any error — older apps still on
    // inappproducts keep working.
    let iapError = "";
    try {
      const modern: IapProduct[] = [];
      let pageToken: string | undefined;
      do {
        const page = await gpFetch<{
          oneTimeProducts?: GpOneTimeProduct[];
          nextPageToken?: string;
        }>(gpCredentials, `${API}/${selectedPackage}/oneTimeProducts`, {
          params: { pageSize: "100", ...(pageToken ? { pageToken } : {}) },
        });
        for (const p of page.oneTimeProducts ?? []) {
          // Use the first purchase option (most apps have exactly one).
          // Prices are decimal-normalized here so downstream code never
          // touches micros or Money conversion directly.
          const po = p.purchaseOptions?.[0];
          const priceRows: GpPriceRow[] = (
            po?.regionalPricingAndAvailabilityConfigs ?? []
          )
            .filter((rc) => rc.price)
            .map((rc) => ({
              regionCode: rc.regionCode,
              currency: rc.price!.currencyCode,
              price: moneyToDecimal(rc.price!),
            }));
          modern.push({
            legacy: false,
            productId: p.productId,
            title: p.listings?.[0]?.title ?? p.productId,
            prices: priceRows,
            purchaseOptionId: po?.purchaseOptionId,
            modernRaw: p,
          });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      setIaps(modern);
    } catch {
      // Modern endpoint rejected this app (migrated or older app). Fall back
      // to the legacy /inappproducts path used by non-migrated apps.
      try {
        const legacy: IapProduct[] = [];
        let token: string | undefined;
        do {
          const page = await gpFetch<{
            inappproduct?: GpInAppProduct[];
            tokenPagination?: { nextPageToken?: string };
          }>(gpCredentials, `${API}/${selectedPackage}/inappproducts`, {
            params: { maxResults: "1000", ...(token ? { token } : {}) },
          });
          for (const p of page.inappproduct ?? []) {
            // Skip legacy subscription-typed entries — managed via /subscriptions.
            if (p.purchaseType === "subscription") continue;
            const priceRows: GpPriceRow[] = Object.entries(p.prices ?? {}).map(
              ([regionCode, mp]) => ({
                regionCode,
                currency: mp.currency,
                price: microsToDecimal(mp.priceMicros),
              }),
            );
            legacy.push({
              legacy: true,
              productId: p.sku,
              title:
                p.listings?.[p.defaultLanguage ?? ""]?.title ??
                Object.values(p.listings ?? {})[0]?.title ??
                p.sku,
              prices: priceRows,
              legacyRaw: p,
            });
          }
          token = page.tokenPagination?.nextPageToken;
        } while (token);
        setIaps(legacy);
      } catch (legacyErr) {
        iapError =
          legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      }
    }

    // --- Subscriptions (base plans hold the regional prices) ---
    // Independent try/catch so an IAP load failure doesn't hide subscriptions.
    let subError = "";
    try {
      const allSubs: GpSubscription[] = [];
      let pageToken: string | undefined;
      do {
        const page = await gpFetch<{
          subscriptions?: GpSubscription[];
          nextPageToken?: string;
        }>(gpCredentials, `${API}/${selectedPackage}/subscriptions`, {
          params: { pageSize: "100", ...(pageToken ? { pageToken } : {}) },
        });
        allSubs.push(...(page.subscriptions ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      setSubs(allSubs);
    } catch (e) {
      subError = e instanceof Error ? e.message : String(e);
    }

    setError(
      iapError && subError
        ? `${iapError}  ·  ${subError}`
        : iapError || subError,
    );
    setLoadingProducts(false);
  }, [gpCredentials, selectedPackage]);

  useEffect(() => {
    if (selectedPackage) {
      setImportPreview(null);
      setSheetText("");
      setApplySummary(null);
      loadProducts();
    }
  }, [selectedPackage, loadProducts]);

  function exportableRows() {
    return currentPrices
      .filter((r) => !GP_NOT_BILLABLE.has(r.regionCode))
      .map((r) => ({
        territoryId: r.regionCode,
        currency: requiredCurrency(r.regionCode, r.currency),
        customerPrice: r.price,
      }));
  }

  function exportCsv() {
    const csv = buildCsv(exportableRows());
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `play-prices-${selectedRef ? refKey(selectedRef).replace(/[^a-z0-9]/gi, "-") : "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generatePolicyPreview() {
    if (currentPrices.length === 0) return;
    setApplySummary(null);
    try {
      const data = generateControlledPriceCsv(buildCsv(exportableRows()), { strategy, maxChangePercent: 25 });
      // Drop the result into the sheet text and run preview immediately
      setSheetText(data);
      const { rows, warnings } = parsePriceSheet(data, { codeLength: 2 });
      const preview: GpImportRow[] = [];
      const warns: string[] = [...warnings];
      for (const row of rows) {
        const current = currentByRegion.get(row.territoryId);
        if (!current) {
          warns.push(
            `${row.territoryId}: not in this product's regional pricing — skipped`,
          );
          continue;
        }
        preview.push({
          regionCode: row.territoryId,
          currency: current.currency,
          currentPrice: current.price,
          newPrice: String(row.price),
        });
      }
      setImportWarnings(warns);
      setImportPreview(preview.length > 0 ? preview : null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate preview"); }
  }

  function previewImport() {
    setError("");
    setApplySummary(null);
    const { rows, warnings } = parsePriceSheet(sheetText, { codeLength: 2 });
    const preview: GpImportRow[] = [];
    for (const row of rows) {
      const current = currentByRegion.get(row.territoryId);
      if (!current) {
        warnings.push(
          `${row.territoryId}: not in this product's regional pricing — skipped. Add it in Play Console first (Monetize → select product → Set prices → add region), then re-import.`,
        );
        continue;
      }
      preview.push({
        regionCode: row.territoryId,
        currency: current.currency,
        currentPrice: current.price,
        newPrice: String(row.price),
      });
    }
    setImportWarnings(warnings);
    setImportPreview(preview);
  }

  /** Apply a map of regionCode → new decimal price to the selected product. */
  const applyChanges = useCallback(
    async (changes: Map<string, number>) => {
      if (!gpCredentials || !selectedRef || changes.size === 0) return;
      setApplying(true);
      setError("");
      setApplySummary(null);
      try {
        if (selectedRef.kind === "iap") {
          const product = iaps.find(
            (p) => p.productId === selectedRef.productId,
          );
          if (!product)
            throw new Error("Product not loaded — refresh and retry.");

          if (product.legacy) {
            // Legacy /inappproducts path — prices are micros on a flat map.
            if (!product.legacyRaw)
              throw new Error(
                "Legacy product payload missing — refresh and retry.",
              );
            const prices = { ...(product.legacyRaw.prices ?? {}) };
            for (const [region, price] of changes) {
              const currency = currentByRegion.get(region)?.currency;
              if (!currency) continue;
              prices[region] = {
                priceMicros: decimalToMicros(price),
                currency,
              };
            }
            await gpFetch(
              gpCredentials,
              `${API}/${selectedPackage}/inappproducts/${selectedRef.productId}`,
              {
                method: "PUT",
                params: { autoConvertMissingPrices: "true" },
                body: { ...product.legacyRaw, prices },
              },
            );
          } else {
            // Modern one-time products path. Apps migrated to the new Publishing
            // API reject the entire legacy /inappproducts namespace — list, get,
            // update, patch, AND batchUpdate — with 403 "Please migrate to the
            // new publishing API". batchUpdate routes through the same disabled
            // collection, so it cannot work for migrated apps. The correct write
            // path is monetization.onetimeproducts PATCH, which takes a
            // OneTimeProduct body and Money prices on
            // purchaseOptions[].regionalPricingAndAvailabilityConfigs (no micros).
            if (!product.modernRaw || !product.purchaseOptionId)
              throw new Error("Product payload missing — refresh and retry.");

            const modern: GpOneTimeProduct = JSON.parse(
              JSON.stringify(product.modernRaw),
            );
            const po = (modern.purchaseOptions ?? []).find(
              (p) => p.purchaseOptionId === product.purchaseOptionId,
            );
            if (!po)
              throw new Error("Purchase option not found — refresh and retry.");

            const CURRENCY_ERR_OTP =
              /Invalid currency for region code (\w+).*Expected (\w+) but got/;
            const NOT_BILLABLE_OTP = /Region code (\w+) is not billable/;
            const otpCorrections: Record<string, string> = {};
            const otpNotBillable = new Set<string>([...GP_NOT_BILLABLE]);

            for (let attempt = 0; attempt < 10; attempt++) {
              po.regionalPricingAndAvailabilityConfigs = (
                po.regionalPricingAndAvailabilityConfigs ?? []
              )
                .filter((rc) => !otpNotBillable.has(rc.regionCode))
                .map((rc) => {
                  const storedCurrency = rc.price?.currencyCode ?? "USD";
                  const correctedCurrency =
                    otpCorrections[rc.regionCode] ??
                    requiredCurrency(rc.regionCode, storedCurrency);
                  const next = changes.get(rc.regionCode);
                  if (next !== undefined) {
                    return {
                      ...rc,
                      price: decimalToMoney(next, correctedCurrency),
                    };
                  }
                  // Preserve existing price, but apply any currency correction.
                  return correctedCurrency !== storedCurrency
                    ? {
                        ...rc,
                        price: {
                          ...rc.price!,
                          currencyCode: correctedCurrency,
                        },
                      }
                    : rc;
                });

              try {
                await gpFetch(
                  gpCredentials,
                  `${API}/${selectedPackage}/onetimeproducts/${selectedRef.productId}`,
                  {
                    method: "PATCH",
                    params: {
                      updateMask: "purchaseOptions",
                      "regionsVersion.version": "2022/02",
                    },
                    body: modern,
                  },
                );
                break;
              } catch (e) {
                if (!(e instanceof GpError)) throw e;
                const msg = e.message;
                const currMatch = msg.match(CURRENCY_ERR_OTP);
                const billMatch = msg.match(NOT_BILLABLE_OTP);
                if (currMatch) {
                  otpCorrections[currMatch[1]] = currMatch[2];
                } else if (billMatch) {
                  otpNotBillable.add(billMatch[1]);
                } else {
                  throw e;
                }
              }
            }
          }
        } else {
          const sub = subs.find((s) => s.productId === selectedRef.productId);
          if (!sub)
            throw new Error("Subscription not loaded — refresh and retry.");

          // Google validates ALL regionalConfigs against the 2022/02 spec on every
          // PATCH — even regions we didn't change. Stale currencies (EUR for BG,
          // XAF for CM, etc.) cause a 400 with the exact region + expected currency
          // in the message. We parse that, correct the payload, and retry until all
          // mismatches are resolved. The static map seeds known corrections so they
          // don't cost extra round-trips.
          const NOT_BILLABLE = /Region code (\w+) is not billable/;
          const PRICE_RANGE = /Price for (\w+) must be between/;
          const CURRENCY_ERR =
            /Invalid currency for region code (\w+).*Expected (\w+) but got/;
          const CONFIGS_REMOVED =
            /Regional configs were removed from the base plan: (.+)/;

          // Regions excluded from payload — only truly "not billable" ones.
          // Google allows removing these; it rejects removing priced regions.
          const notBillable = new Set<string>();
          // Regions that had a price-range error — keep in payload at $0.99.
          const priceResets = new Map<string, number>();
          // Runtime currency overrides learned from API errors (fallback if
          // convertRegionPrices didn't cover a region).
          const runtimeCorrections: Record<string, string> = {};
          const allWarnings: string[] = [];

          const correctCurrency = (
            regionCode: string,
            storedCurrency: string,
          ) =>
            runtimeCorrections[regionCode] ??
            requiredCurrency(regionCode, storedCurrency);

          for (let attempt = 0; attempt < 20; attempt++) {
            const updated: GpSubscription = JSON.parse(JSON.stringify(sub));
            const plan = updated.basePlans?.find(
              (b) => b.basePlanId === selectedRef.basePlanId,
            );
            if (!plan)
              throw new Error("Base plan not found — refresh and retry.");

            plan.regionalConfigs = (plan.regionalConfigs ?? [])
              .filter((rc) => !notBillable.has(rc.regionCode))
              .map((rc) => {
                if (!rc.price) return rc;
                const correct = correctCurrency(
                  rc.regionCode,
                  rc.price.currencyCode,
                );
                const fallback = priceResets.get(rc.regionCode);
                if (fallback !== undefined)
                  return { ...rc, price: decimalToMoney(fallback, correct) };
                const next = changes.get(rc.regionCode);
                if (next !== undefined)
                  return { ...rc, price: decimalToMoney(next, correct) };
                return correct !== rc.price.currencyCode
                  ? { ...rc, price: { ...rc.price, currencyCode: correct } }
                  : rc;
              });

            try {
              await gpFetch(
                gpCredentials,
                `${API}/${selectedPackage}/subscriptions/${selectedRef.productId}`,
                {
                  method: "PATCH",
                  params: {
                    updateMask: "basePlans",
                    "regionsVersion.version": "2022/02",
                  },
                  body: updated,
                },
              );
              break; // success
            } catch (e) {
              if (!(e instanceof GpError)) throw e;

              // Currency still wrong — convertRegionPrices missed this region.
              // Learn from the error and retry once.
              const currMatch = e.message.match(CURRENCY_ERR);
              if (currMatch) {
                runtimeCorrections[currMatch[1]] = currMatch[2];
                allWarnings.push(
                  `Auto-corrected currency: ${currMatch[1]} → ${currMatch[2]}`,
                );
                continue;
              }

              // Not billable — Google allows removing these.
              const nbMatch = e.message.match(NOT_BILLABLE);
              if (nbMatch) {
                notBillable.add(nbMatch[1]);
                allWarnings.push(
                  `⚠ ${nbMatch[1]}: not billable in regions version 2022/02 — excluded`,
                );
                continue;
              }

              // Price out of range — must stay in payload; use $0.99 fallback.
              const prMatch = e.message.match(PRICE_RANGE);
              if (prMatch) {
                priceResets.set(prMatch[1], 0.99);
                allWarnings.push(
                  `⚠ ${prMatch[1]}: price out of allowed range — reset to $0.99. Set the correct price in Play Console.`,
                );
                continue;
              }

              // We excluded a priced region — undo the exclusion, use $0.99 instead.
              const removedMatch = e.message.match(CONFIGS_REMOVED);
              if (removedMatch) {
                for (const r of removedMatch[1]
                  .split(/,\s*/)
                  .map((s) => s.trim())
                  .filter(Boolean)) {
                  notBillable.delete(r);
                  priceResets.set(r, 0.99);
                  allWarnings.push(
                    `⚠ ${r}: cannot be removed — reset to $0.99. Fix in Play Console.`,
                  );
                }
                continue;
              }

              throw e;
            }
          }

          if (allWarnings.length > 0) {
            setImportWarnings((prev) => [...prev, ...allWarnings]);
          }
        }

        setApplySummary({
          productLabel: refLabel(selectedRef),
          regionsChanged: changes.size,
          warnings: importWarnings,
        });
        setImportPreview(null);
        setSheetText("");
        await loadProducts();
        setSelectedRefKey(refKey(selectedRef));
      } catch (e) {
        setError(
          e instanceof GpError || e instanceof Error ? e.message : String(e),
        );
      } finally {
        setApplying(false);
      }
    },
    [
      gpCredentials,
      selectedRef,
      selectedPackage,
      currentByRegion,
      iaps,
      subs,
      loadProducts,
      importWarnings,
    ],
  );

  async function applyImport(withSnapshot = true, snapshotName?: string) {
    if (!importPreview) return;
    setSnapshotDialog(false);
    const changes = new Map(
      importPreview
        .filter((r) => r.newPrice !== r.currentPrice)
        .map((r) => [r.regionCode, Number(r.newPrice)] as const),
    );
    if (withSnapshot) {
      takeSnapshot({
        appId: selectedPackage,
        scope: snapshotScope,
        label: snapshotName || `Before import · ${changes.size} regions`,
        rows: currentPrices.map((r) => ({
          territoryId: r.regionCode,
          pricePointId: "",
          customerPrice: r.price,
          currency: r.currency,
        })),
      });
      setSnapRefresh((n) => n + 1);
    }
    await applyChanges(changes);
  }

  async function restoreSnapshot(snapshot: PriceSnapshot) {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    const changes = new Map(
      snapshot.rows
        .filter((row) => {
          const current = currentByRegion.get(row.territoryId);
          return current && Number(current.price) !== Number(row.customerPrice);
        })
        .map((row) => [row.territoryId, Number(row.customerPrice)] as const),
    );
    if (changes.size === 0) {
      setApplySummary({
        productLabel: refLabel(selectedRef!),
        regionsChanged: 0,
        warnings: ["The current Google Play storefront grid already matches this snapshot."],
      });
      return;
    }
    takeSnapshot({
      appId: selectedPackage,
      scope: snapshotScope,
      label: `Before restoring · ${snapshot.label}`,
      rows: currentPrices.map((row) => ({
        territoryId: row.regionCode,
        pricePointId: "",
        customerPrice: row.price,
        currency: row.currency,
      })),
    });
    setSnapRefresh((value) => value + 1);
    await applyChanges(changes);
  }

  function saveNamedSnapshot(label: string) {
    if (!selectedRef) return;
    takeSnapshot({
      appId: selectedPackage,
      scope: snapshotScope,
      label,
      rows: currentPrices.map((r) => ({
        territoryId: r.regionCode,
        pricePointId: "",
        customerPrice: r.price,
        currency: r.currency,
      })),
    });
    setSnapRefresh((n) => n + 1);
  }

  const filteredPrices = useMemo(() => {
    const q = search.trim().toUpperCase();
    if (!q) return currentPrices;
    return currentPrices.filter(
      (r) => r.regionCode.includes(q) || r.currency.includes(q),
    );
  }, [currentPrices, search]);

  const changedCount =
    importPreview?.filter((r) => r.newPrice !== r.currentPrice).length ?? 0;

  if (!hydrated) return null;

  return (
    <RequireAccount>
      <main className="max-w-5xl mx-auto w-full px-6 py-10">
        {/* Play-specific header — Apple credentials/TopBar don't apply here */}
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              ← Home
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">
              Store<span className="text-emerald-400">Ops</span>{" "}
              <span className="text-sm font-normal text-zinc-500">
                · Google Play
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/apps"
              className="text-sm text-zinc-400 hover:text-emerald-400 transition"
            >
              App Store →
            </Link>
            <Link
              href="/account"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition"
            >
              Account
            </Link>
            {gpCredentials && (
              <button
                onClick={() => clearGpCredentials()}
                className="text-sm text-zinc-500 hover:text-zinc-200 transition"
              >
                Disconnect
              </button>
            )}
          </div>
        </header>

        {error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {applying && (
          <UpdateStatus
            title="Updating Google Play pricing…"
            detail="Your regional price configuration is being sent to Google Play. Keep this page open until it finishes."
          />
        )}

        {applySummary && (
          <ApplySuccessDialog
            productLabel={applySummary.productLabel}
            regionsChanged={applySummary.regionsChanged}
            warnings={applySummary.warnings}
            onClose={() => setApplySummary(null)}
          />
        )}

        {!gpCredentials ? (
          /* ---- Connect ---- */
          <div className="card card-hero p-6 max-w-xl">
            <h2 className="font-semibold text-lg mb-1">Connect Google Play</h2>
            <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
              Upload your service-account JSON. Same privacy model as the Apple
              side: the key becomes a{" "}
              <strong className="text-zinc-200">
                non-extractable browser key
              </strong>{" "}
              — it signs short-lived tokens locally and can never be read back.
              It never touches our servers.
            </p>
            <label className="block">
              <input
                type="file"
                accept=".json"
                className="hidden"
                id="gp-json-file"
                disabled={connecting}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await connect(await f.text());
                  e.target.value = "";
                }}
              />
              <span
                className="inline-block cursor-pointer rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 transition"
                onClick={() => document.getElementById("gp-json-file")?.click()}
              >
                {connecting ? "Importing key…" : "Choose service-account JSON"}
              </span>
            </label>
            <div className="mt-5 text-xs text-zinc-500 leading-relaxed space-y-1">
              <p className="font-semibold text-zinc-400">
                Setup (one time, ~3 minutes):
              </p>
              <p>
                1. Google Cloud Console → create/select a project → enable the{" "}
                <strong>Google Play Android Developer API</strong>
              </p>
              <p>
                2. IAM → Service Accounts → create one → Keys → Add key → JSON
              </p>
              <p>
                3. Play Console → Users and permissions → invite the
                service-account email with{" "}
                <strong>“Manage store presence” + “Manage orders”</strong> (or
                Admin)
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ---- Packages ---- */}
            <div className="card p-5 mb-6">
              <div className="flex items-baseline justify-between mb-1">
                <h2 className="font-semibold">Your apps</h2>
                <span className="text-xs text-zinc-500 font-mono truncate max-w-[50%]">
                  {gpCredentials.clientEmail}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Google&apos;s API has no “list apps” endpoint — add each
                app&apos;s package name once (e.g. com.yourcompany.app).
              </p>
              <div className="flex gap-2 mb-3 max-w-md">
                <input
                  value={newPackage}
                  onChange={(e) => setNewPackage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newPackage.trim()) {
                      addPackage(newPackage.trim());
                      setSelectedPackage(newPackage.trim());
                      setNewPackage("");
                    }
                  }}
                  placeholder="com.example.app"
                  className="flex-1 rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!newPackage.trim()) return;
                    addPackage(newPackage.trim());
                    setSelectedPackage(newPackage.trim());
                    setNewPackage("");
                  }}
                  disabled={!newPackage.trim()}
                  className="text-sm rounded-md border border-zinc-700 px-4 text-zinc-300 hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40 transition"
                >
                  Add
                </button>
              </div>
              {packages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {packages.map((pkg) => (
                    <span
                      key={pkg}
                      className={`inline-flex items-center gap-2 text-xs rounded-md border px-3 py-1.5 font-mono cursor-pointer transition ${
                        selectedPackage === pkg
                          ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                      }`}
                      onClick={() => setSelectedPackage(pkg)}
                    >
                      {pkg}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePackage(pkg);
                          if (selectedPackage === pkg) setSelectedPackage("");
                        }}
                        className="text-zinc-600 hover:text-red-400"
                        aria-label={`Remove ${pkg}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ---- Product selector ---- */}
            {selectedPackage && (
              <div className="card p-5 mb-6">
                <h2 className="font-semibold mb-3">Select product</h2>
                {loadingProducts ? (
                  <p className="text-sm text-zinc-400 animate-pulse">
                    Loading products from Google Play…
                  </p>
                ) : productRefs.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    No products found. Check the service account has access to{" "}
                    <span className="font-mono">{selectedPackage}</span>.
                  </p>
                ) : (
                  <select
                    value={selectedRefKey}
                    onChange={(e) => {
                      setSelectedRefKey(e.target.value);
                      setImportPreview(null);
                      setSheetText("");
                      setApplySummary(null);
                    }}
                    className="w-full max-w-md rounded-md bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="">Choose a product…</option>
                    {productRefs.map((r) => (
                      <option key={refKey(r)} value={refKey(r)}>
                        {refLabel(r)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {selectedRef && (
              <>
                {/* ---- Import sheet ---- */}
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
                        ↓ Export CSV
                      </button>
                    </div>
                  </div>

                  {/* Controlled policy picker */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span className="text-xs text-zinc-500 shrink-0">
                      Policy:
                    </span>
                    {STRATEGIES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setStrategy(s.key)}
                        title={s.tagline}
                        className={`text-xs rounded-md px-2.5 py-1 border transition ${
                          strategy === s.key
                            ? "bg-emerald-900/60 border-emerald-700 text-emerald-300"
                            : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        }`}
                      >
                        {s.emoji} {s.label}
                        {s.star && (
                          <span className="ml-1 text-amber-400 text-[10px]">
                            ★
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={generatePolicyPreview}
                    disabled={currentPrices.length === 0}
                    className="w-full rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition mb-4"
                  >
                    {`Generate bounded preview · ${getStrategy(strategy).emoji} ${getStrategy(strategy).label}`}
                  </button>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 h-px bg-zinc-800" />
                    <span className="text-xs text-zinc-600">
                      or paste your own CSV
                    </span>
                    <div className="flex-1 h-px bg-zinc-800" />
                  </div>

                  <textarea
                    value={sheetText}
                    onChange={(e) => {
                      setSheetText(e.target.value);
                      setImportPreview(null);
                    }}
                    placeholder={"region,price\nUS,4.99\nEG,49.99\nDE,3.99"}
                    rows={4}
                    className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none resize-y"
                  />

                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <label className="text-xs text-zinc-400 flex items-center gap-1.5">
                      <input
                        type="file"
                        accept=".csv,.tsv,.txt"
                        className="hidden"
                        id="play-csv-file"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setSheetText(await f.text());
                            setImportPreview(null);
                          }
                        }}
                      />
                      <button
                        onClick={() =>
                          document.getElementById("play-csv-file")?.click()
                        }
                        className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300 hover:border-zinc-500 transition"
                      >
                        Upload .csv
                      </button>
                    </label>

                    <button
                      onClick={previewImport}
                      disabled={!sheetText.trim() || applying}
                      className="text-sm rounded-md border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-emerald-600 disabled:opacity-40 transition"
                    >
                      Preview changes
                    </button>
                    {importPreview && (
                      <button
                        onClick={() =>
                          isPro ? setSnapshotDialog(true) : setPaywallOpen(true)
                        }
                        disabled={applying || changedCount === 0}
                        className="text-sm rounded-md bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 transition"
                      >
                        {applying
                          ? "Applying…"
                          : `${isPro ? "" : "🔒 "}Apply ${changedCount} change${changedCount === 1 ? "" : "s"} to Google Play`}
                      </button>
                    )}
                  </div>

                  {importWarnings.length > 0 && (
                    <div className="mt-3 text-xs text-amber-400/90 space-y-0.5 max-h-24 overflow-y-auto">
                      {importWarnings.map((w, i) => (
                        <p key={i}>⚠ {w}</p>
                      ))}
                    </div>
                  )}

                  {importPreview && (
                    <div className="mt-4 max-h-64 overflow-y-auto rounded-md border border-zinc-800">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-900">
                          <tr className="text-left text-xs text-zinc-500">
                            <th className="px-3 py-2">Region</th>
                            <th className="px-3 py-2">Current</th>
                            <th className="px-3 py-2">New</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.map((r) => (
                            <tr
                              key={r.regionCode}
                              className="border-t border-zinc-800/60"
                            >
                              <td className="px-3 py-1.5 font-mono text-xs">
                                {r.regionCode}
                              </td>
                              <td className="px-3 py-1.5 text-zinc-400">
                                {formatPrice(r.currentPrice, r.currency)}
                              </td>
                              <td
                                className={`px-3 py-1.5 ${
                                  r.newPrice !== r.currentPrice
                                    ? "text-emerald-400"
                                    : "text-zinc-500"
                                }`}
                              >
                                {formatPrice(r.newPrice, r.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ---- Snapshots ---- */}
                <SnapshotPanel
                  appId={selectedPackage}
                  scope={snapshotScope}
                  refreshKey={snapRefresh}
                  onRestore={restoreSnapshot}
                  onSave={saveNamedSnapshot}
                  busy={applying}
                  platform="google"
                />

                {/* ---- Current prices ---- */}
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold">
                    Current prices{" "}
                    <span className="text-zinc-500 font-normal text-sm">
                      {currentPrices.length} regions
                    </span>
                  </h2>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter: US, EG, EUR…"
                    className="rounded-md bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm w-48 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {currentPrices.length === 0 ? (
                  <p className="text-sm text-zinc-400">
                    No regional prices set for this product yet — set an initial
                    price in Play Console first.
                  </p>
                ) : (
                  <div className="rounded-md border border-zinc-800 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-900">
                        <tr className="text-left text-xs text-zinc-500">
                          <th className="px-3 py-2">Region</th>
                          <th className="px-3 py-2">Currency</th>
                          <th className="px-3 py-2">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPrices.map((r) => (
                          <tr
                            key={r.regionCode}
                            className="border-t border-zinc-800/60"
                          >
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {r.regionCode}
                            </td>
                            <td className="px-3 py-1.5 text-zinc-400">
                              {r.currency}
                            </td>
                            <td className="px-3 py-1.5">
                              {formatPrice(r.price, r.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <SnapshotConfirmDialog
          open={snapshotDialog}
          defaultName={
            importPreview
              ? `Before import · ${importPreview.filter((r) => r.newPrice !== r.currentPrice).length} regions`
              : ""
          }
          onSaveAndApply={(name) => applyImport(true, name)}
          onSkipAndApply={() => applyImport(false)}
          onCancel={() => setSnapshotDialog(false)}
        />
        <PaywallModal
          open={paywallOpen}
          onClose={() => setPaywallOpen(false)}
        />
      </main>
    </RequireAccount>
  );
}
