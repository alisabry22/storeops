"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PaywallModal } from "@/components/Paywall";
import { RequireAccount } from "@/components/RequireAccount";
import { SnapshotConfirmDialog } from "@/components/SnapshotConfirmDialog";
import { ApplySuccessDialog } from "@/components/ApplySuccessDialog";
import { AiRepricePanel } from "@/components/AiRepricePanel";
import { UpdateStatus } from "@/components/UpdateStatus";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { useIsPro } from "@/lib/license";
import { useHydrated } from "@/lib/use-hydrated";
import {
  takeRequiredSnapshot,
  takeSnapshot,
  type PriceSnapshot,
} from "@/lib/snapshots";
import { buildCsv, parsePriceSheet } from "@/lib/pricing-import";
import { findPriceMismatches } from "@/lib/price-verification";
import { STRATEGIES, type PricingStrategy } from "@/lib/pricing-strategies";
import {
  findMovementCapViolations,
  movementCapErrorMessage,
  pricingPolicyMultiplier,
  stagePriceTowardTarget,
} from "@/lib/pricing-policy";
import {
  groupRegionalAnchorEstimates,
  matchingApprovedRegionalPrices,
  type GoogleApprovedPricingPreview,
} from "@/lib/gp/price-normalization";
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
  type GpInAppProduct,
  type GpOneTimeProduct,
  type GpMoney,
  type GpPriceRow,
  type GpSubscription,
  type GpConvertRegionPricesResponse,
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
  | {
      kind: "iap";
      productId: string;
      purchaseOptionId?: string;
      title: string;
    }
  | { kind: "sub"; productId: string; basePlanId: string; title: string };

function refKey(r: ProductRef): string {
  return r.kind === "iap"
    ? `iap:${r.productId}${r.purchaseOptionId ? `:${r.purchaseOptionId}` : ""}`
    : `sub:${r.productId}:${r.basePlanId}`;
}

function refLabel(r: ProductRef): string {
  return r.kind === "iap"
    ? `${r.title} · one-time · ${r.productId}${r.purchaseOptionId ? `/${r.purchaseOptionId}` : ""}`
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

  const hydrated = useHydrated();
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
  const [googleApprovedPreview, setGoogleApprovedPreview] =
    useState<GoogleApprovedPricingPreview | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState<{
    title: string;
    detail: string;
    events: string[];
  } | null>(null);
  const [applySummary, setApplySummary] = useState<{
    productLabel: string;
    regionsChanged: number;
    warnings: string[];
    verified?: boolean;
  } | null>(null);
  const [strategy, setStrategy] = useState<PricingStrategy>("ppp");
  const [pricingMode, setPricingMode] = useState<"anchor" | "adjust">("anchor");
  const [anchorUsd, setAnchorUsd] = useState(29.99);
  const [anchorMaxChangePercent, setAnchorMaxChangePercent] = useState(25);
  const [applyFullAnchorTarget, setApplyFullAnchorTarget] = useState(false);
  const [previewMovementCap, setPreviewMovementCap] = useState<number | null>(null);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Pro gate + snapshots
  const isPro = useIsPro();
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [snapshotDialog, setSnapshotDialog] = useState(false);
  const [snapRefresh, setSnapRefresh] = useState(0);

  useEffect(() => {
    if (packages.length === 1) {
      queueMicrotask(() => setSelectedPackage(packages[0]));
    }
  }, [packages]);

  const productRefs = useMemo<ProductRef[]>(() => {
    const refs: ProductRef[] = [];
    for (const p of iaps) {
      refs.push({
        kind: "iap",
        productId: p.productId,
        purchaseOptionId: p.purchaseOptionId,
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
      const product = iaps.find(
        (p) =>
          p.productId === selectedRef.productId &&
          p.purchaseOptionId === selectedRef.purchaseOptionId
      );
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
          const options = p.purchaseOptions ?? [];
          for (const po of options) {
            const priceRows: GpPriceRow[] = (
              po.regionalPricingAndAvailabilityConfigs ?? []
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
              purchaseOptionId: po.purchaseOptionId,
              modernRaw: p,
            });
          }
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
      queueMicrotask(() => {
        setImportPreview(null);
        setGoogleApprovedPreview(null);
        setPreviewMovementCap(null);
        setSheetText("");
        setApplySummary(null);
        void loadProducts();
      });
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

  const fetchAuthoritativePrices = useCallback(
    async (ref: ProductRef): Promise<Map<string, number>> => {
      if (!gpCredentials) throw new Error("Google Play is not connected.");
      const result = new Map<string, number>();
      if (ref.kind === "sub") {
        const fresh = await gpFetch<GpSubscription>(
          gpCredentials,
          `${API}/${selectedPackage}/subscriptions/${ref.productId}`,
        );
        const plan = fresh.basePlans?.find((item) => item.basePlanId === ref.basePlanId);
        for (const row of plan?.regionalConfigs ?? []) {
          if (row.price) result.set(row.regionCode, Number(moneyToDecimal(row.price)));
        }
        return result;
      }

      const local = iaps.find(
        (item) =>
          item.productId === ref.productId &&
          item.purchaseOptionId === ref.purchaseOptionId
      );
      if (local?.legacy) {
        const fresh = await gpFetch<GpInAppProduct>(
          gpCredentials,
          `${API}/${selectedPackage}/inappproducts/${ref.productId}`,
        );
        for (const [region, price] of Object.entries(fresh.prices ?? {})) {
          result.set(region, Number(microsToDecimal(price.priceMicros)));
        }
        return result;
      }

      const fresh = await gpFetch<GpOneTimeProduct>(
        gpCredentials,
        `${API}/${selectedPackage}/onetimeproducts/${ref.productId}`,
      );
      const option = fresh.purchaseOptions?.find(
        (item) => item.purchaseOptionId === local?.purchaseOptionId,
      );
      for (const row of option?.regionalPricingAndAvailabilityConfigs ?? []) {
        if (row.price) result.set(row.regionCode, Number(moneyToDecimal(row.price)));
      }
      return result;
    },
    [gpCredentials, iaps, selectedPackage],
  );

  function acceptGeneratedPolicy(
    data: string,
    extraWarnings: string[] = [],
  ) {
    setApplySummary(null);
    setGoogleApprovedPreview(null);
    try {
      setSheetText(data);
      const { rows, warnings } = parsePriceSheet(data, { codeLength: 2 });
      const preview: GpImportRow[] = [];
      const warns: string[] = [...extraWarnings, ...warnings];
      for (const row of rows) {
        const current = currentByRegion.get(row.territoryId);
        if (!current) {
          warns.push(
            `${row.territoryId}: not in this product's regional pricing — skipped`,
          );
          continue;
        }
        if (GP_NOT_BILLABLE.has(row.territoryId)) {
          warns.push(
            `${row.territoryId}: not billable in Google regions version 2022/02 — skipped`,
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

  async function generateAnchorPreview() {
    if (!gpCredentials || currentPrices.length === 0 || anchorUsd <= 0) return;
    setAnchorLoading(true);
    setError("");
    setApplySummary(null);
    try {
      // Ask Google for each policy band's complete regional grid. Multiplying
      // a converted local price afterward creates amounts that violate local
      // pricing patterns (the source of "price for XX must be rounded").
      const multiplierFor = (regionCode: string) =>
        regionCode === "US"
          ? 1
          : pricingPolicyMultiplier(strategy, regionCode);
      const multipliers = [
        ...new Set(currentPrices.map((row) => multiplierFor(row.regionCode))),
      ];
      const convertedByMultiplier = new Map(
        await Promise.all(
          multipliers.map(async (multiplier) => [
            multiplier,
            await gpFetch<GpConvertRegionPricesResponse>(
              gpCredentials,
              `${API}/${selectedPackage}/pricing:convertRegionPrices`,
              {
                method: "POST",
                body: {
                  price: decimalToMoney(anchorUsd * multiplier, "USD"),
                },
              },
            ),
          ] as const),
        ),
      );
      const current = new Map(currentPrices.map((row) => [row.regionCode, Number(row.price)]));
      const warnings: string[] = [];
      const approvedPrices: Record<string, GpMoney> = {};
      const rows = currentPrices.flatMap((row) => {
        if (GP_NOT_BILLABLE.has(row.regionCode)) {
          warnings.push(
            `${row.regionCode}: not billable in Google regions version 2022/02 — excluded`,
          );
          return [];
        }
        const multiplier = multiplierFor(row.regionCode);
        const baseline = convertedByMultiplier
          .get(multiplier)
          ?.convertedRegionPrices?.[row.regionCode];
        if (!baseline?.price) {
          warnings.push(`${row.regionCode}: Google returned no anchor conversion — kept out of this preview`);
          return [];
        }
        const target = Number(moneyToDecimal(baseline.price));
        const currentPrice = current.get(row.regionCode);
        const stagedTarget = applyFullAnchorTarget
          ? target
          : stagePriceTowardTarget(
              currentPrice ?? null,
              target,
              anchorMaxChangePercent
            );
        if (Math.abs(stagedTarget - target) > 0.000001) {
          warnings.push(
            `${row.regionCode}: final policy target ${target} ${baseline.price.currencyCode}; staged to ${stagedTarget} by the ${anchorMaxChangePercent}% movement cap`,
          );
        } else {
          approvedPrices[row.regionCode] = baseline.price;
        }
        return [{
          territoryId: row.regionCode,
          currency: baseline.price.currencyCode,
          customerPrice: String(Math.round(stagedTarget * 1_000_000) / 1_000_000),
        }];
      });
      setPreviewMovementCap(
        applyFullAnchorTarget ? null : anchorMaxChangePercent
      );
      acceptGeneratedPolicy(buildCsv(rows), warnings);
      const regionsVersions = new Set(
        [...convertedByMultiplier.values()]
          .map((response) => response.regionVersion?.version)
          .filter((version): version is string => Boolean(version)),
      );
      if (regionsVersions.size !== 1) {
        throw new Error(
          "Google returned inconsistent region versions while generating the preview. Nothing was applied; regenerate and retry.",
        );
      }
      setGoogleApprovedPreview({
        prices: approvedPrices,
        regionsVersion: [...regionsVersions][0],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build Google anchor preview");
    } finally {
      setAnchorLoading(false);
    }
  }

  function previewImport() {
    setError("");
    setApplySummary(null);
    setGoogleApprovedPreview(null);
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
      if (GP_NOT_BILLABLE.has(row.territoryId)) {
        warnings.push(
          `${row.territoryId}: not billable in Google regions version 2022/02 — skipped`,
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
    async (
      changes: Map<string, number>,
      approvedPreview: GoogleApprovedPricingPreview | null = null,
      movementCap: number | null = null,
    ) => {
      if (!gpCredentials || !selectedRef || changes.size === 0) return;
      let storeAccepted = false;
      let liveVerified = false;
      const reportApplyStatus = (
        title: string,
        detail: string,
        event?: string,
      ) => {
        setApplyStatus((current) => ({
          title,
          detail,
          events: event
            ? [...(current?.events ?? []), event]
            : current?.events ?? [],
        }));
      };
      setApplying(true);
      setError("");
      setApplySummary(null);
      setApplyStatus({
        title: "Preparing the Google Play update…",
        detail: "No prices have been sent yet. Reading the latest product configuration.",
        events: [],
      });
      try {
        const applyWarnings = [...importWarnings];
        // convertRegionPrices tells us which regions version its currencies and
        // price patterns belong to. The subsequent PATCH must use that exact
        // version; hard-coding 2022/02 made Google's current BG/EUR conversion
        // collide with a PATCH that expected the older BG/BGN mapping.
        let pricingRegionsVersion =
          approvedPreview?.regionsVersion ?? "2022/02";
        const reviewedApprovedPrices = matchingApprovedRegionalPrices(
          changes,
          approvedPreview,
        );
        const enforceFinalMovementCap = () => {
          if (movementCap === null) return;
          const violations = findMovementCapViolations(
            new Map(
              [...currentByRegion].map(([region, row]) => [
                region,
                Number(row.price),
              ])
            ),
            changes,
            movementCap
          );
          if (violations.length > 0) {
            throw new Error(movementCapErrorMessage(violations, movementCap));
          }
        };
        for (const regionCode of [...changes.keys()]) {
          if (!GP_NOT_BILLABLE.has(regionCode)) continue;
          changes.delete(regionCode);
          applyWarnings.push(
            `${regionCode}: not billable in Google regions version 2022/02 — excluded`,
          );
        }
        if (changes.size === 0) {
          setApplySummary({
            productLabel: refLabel(selectedRef),
            regionsChanged: 0,
            warnings: applyWarnings,
          });
          return;
        }

        /**
         * Google validates country-specific billable price patterns in addition
         * to ISO currency precision. When it reports "must be rounded", use
         * convertRegionPrices as the source of truth and converge on the
         * closest official regional amount instead of inventing a local rule.
         */
        const resolveBillableRegionalPrice = async (
          regionCode: string,
          targetLocalPrice: number,
        ): Promise<GpMoney> => {
          if (!Number.isFinite(targetLocalPrice) || targetLocalPrice <= 0) {
            throw new Error(`${regionCode}: cannot round an invalid target price.`);
          }

          const clampAnchor = (value: number) =>
            Math.max(0.05, Math.min(1000, value));
          let usdAnchor = clampAnchor(changes.get("US") ?? targetLocalPrice);
          let best: { price: GpMoney; distance: number } | null = null;

          // The conversion is close to linear before Google's market rounding.
          // Two or three ratio corrections normally land on the closest
          // accepted price pattern for the requested region.
          for (let attempt = 0; attempt < 4; attempt++) {
            const converted = await gpFetch<GpConvertRegionPricesResponse>(
              gpCredentials,
              `${API}/${selectedPackage}/pricing:convertRegionPrices`,
              {
                method: "POST",
                body: { price: decimalToMoney(usdAnchor, "USD") },
              },
            );
            pricingRegionsVersion =
              converted.regionVersion?.version ?? pricingRegionsVersion;
            const regional = converted.convertedRegionPrices?.[regionCode]?.price;
            if (!regional) {
              throw new Error(
                `${regionCode}: Google returned no billable regional price. Nothing was changed.`,
              );
            }
            const candidate = Number(moneyToDecimal(regional));
            if (!Number.isFinite(candidate) || candidate <= 0) {
              throw new Error(
                `${regionCode}: Google returned an invalid converted price. Nothing was changed.`,
              );
            }
            const distance = Math.abs(candidate - targetLocalPrice);
            if (!best || distance < best.distance) {
              best = { price: regional, distance };
            }
            if (distance <= Math.max(0.000001, targetLocalPrice * 0.000001)) {
              break;
            }
            const nextAnchor = clampAnchor(
              usdAnchor * (targetLocalPrice / candidate),
            );
            if (Math.abs(nextAnchor - usdAnchor) < 0.000001) break;
            usdAnchor = nextAnchor;
          }

          if (!best) {
            throw new Error(
              `${regionCode}: Google could not produce a billable price. Nothing was changed.`,
            );
          }
          return best.price;
        };

        /**
         * Normalize all requested regional prices before the first write.
         * Google otherwise reports only one invalid regional price per PATCH,
         * which turns a 100-country update into a long reject/retry loop.
         *
         * One reference conversion lets us infer which targets share the same
         * approximate USD anchor. Each group then needs one official Google
         * conversion, regardless of how many countries it contains.
         */
        const normalizeRegionalTargets = async (
          targets: Map<string, number>,
        ): Promise<Record<string, GpMoney>> => {
          if (targets.size === 0) return {};
          const clampAnchor = (value: number) =>
            Math.max(0.05, Math.min(1000, value));
          const referenceAnchorUsd = clampAnchor(
            targets.get("US") ??
              Number(currentByRegion.get("US")?.price ?? 10),
          );
          reportApplyStatus(
            "Google is normalizing regional prices…",
            `No write has been sent. StoreOps is converting ${targets.size} requested prices to Google-approved local price patterns.`,
          );
          const reference = await gpFetch<GpConvertRegionPricesResponse>(
            gpCredentials,
            `${API}/${selectedPackage}/pricing:convertRegionPrices`,
            {
              method: "POST",
              body: { price: decimalToMoney(referenceAnchorUsd, "USD") },
            },
          );
          pricingRegionsVersion =
            reference.regionVersion?.version ?? pricingRegionsVersion;
          const groups = groupRegionalAnchorEstimates(
            referenceAnchorUsd,
            [...targets].flatMap(([regionCode, targetLocalPrice]) => {
              const referencePrice =
                reference.convertedRegionPrices?.[regionCode]?.price;
              if (!referencePrice) return [];
              return [
                {
                  regionCode,
                  targetLocalPrice,
                  referenceLocalPrice: Number(moneyToDecimal(referencePrice)),
                },
              ];
            }),
          );
          const normalized: Record<string, GpMoney> = {};

          // Keep API pressure bounded while still avoiding a slow serial pass.
          for (let offset = 0; offset < groups.length; offset += 5) {
            const batch = groups.slice(offset, offset + 5);
            const results = await Promise.all(
              batch.map(async (group) => ({
                group,
                converted:
                  Math.abs(group.anchorUsd - referenceAnchorUsd) < 0.000001
                    ? reference
                    : await gpFetch<GpConvertRegionPricesResponse>(
                        gpCredentials,
                        `${API}/${selectedPackage}/pricing:convertRegionPrices`,
                        {
                          method: "POST",
                          body: {
                            price: decimalToMoney(group.anchorUsd, "USD"),
                          },
                        },
                      ),
              })),
            );
            for (const { group, converted } of results) {
              for (const member of group.members) {
                const official =
                  converted.convertedRegionPrices?.[member.regionCode]?.price;
                if (!official) continue;
                normalized[member.regionCode] = official;
                const officialValue = Number(moneyToDecimal(official));
                changes.set(member.regionCode, officialValue);
                if (
                  Math.abs(officialValue - member.targetLocalPrice) >
                  Math.max(0.000001, member.targetLocalPrice * 0.000001)
                ) {
                  applyWarnings.push(
                    `${member.regionCode}: requested ${member.targetLocalPrice} → Google-approved ${officialValue} ${official.currencyCode}`,
                  );
                }
              }
            }
          }
          reportApplyStatus(
            "Regional prices normalized — ready to write",
            `Google supplied valid local price patterns for ${Object.keys(normalized).length} of ${targets.size} requested regions.`,
            `${groups.length} conversion ${groups.length === 1 ? "group" : "groups"} normalized before the write`,
          );
          return normalized;
        };

        if (selectedRef.kind === "iap") {
          const product = iaps.find(
            (p) =>
              p.productId === selectedRef.productId &&
              p.purchaseOptionId === selectedRef.purchaseOptionId,
          );
          if (!product)
            throw new Error("Product not loaded — refresh and retry.");

          if (product.legacy) {
            // Legacy /inappproducts path — prices are micros on a flat map.
            if (!product.legacyRaw)
              throw new Error(
                "Legacy product payload missing — refresh and retry.",
              );
            const freshLegacy = await gpFetch<GpInAppProduct>(
              gpCredentials,
              `${API}/${selectedPackage}/inappproducts/${selectedRef.productId}`,
            );
            enforceFinalMovementCap();
            const prices = { ...(freshLegacy.prices ?? {}) };
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
                body: { ...freshLegacy, prices },
              },
            );
            storeAccepted = true;
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

            const freshModern = await gpFetch<GpOneTimeProduct>(
              gpCredentials,
              `${API}/${selectedPackage}/onetimeproducts/${selectedRef.productId}`,
            );
            const modern: GpOneTimeProduct = JSON.parse(JSON.stringify(freshModern));
            const po = (modern.purchaseOptions ?? []).find(
              (p) => p.purchaseOptionId === product.purchaseOptionId,
            );
            if (!po)
              throw new Error("Purchase option not found — refresh and retry.");

            const CURRENCY_ERR_OTP =
              /Invalid currency for region code (\w+).*Expected (\w+) but got/;
            const NOT_BILLABLE_OTP = /Region code (\w+) is not billable/;
            const PRICE_ROUNDING_OTP = /price for (\w+) must be rounded/i;
            const otpCorrections: Record<string, string> = {};
            const otpNotBillable = new Set<string>([...GP_NOT_BILLABLE]);
            const configuredRegions = new Set(
              (po.regionalPricingAndAvailabilityConfigs ?? []).map(
                (config) => config.regionCode,
              ),
            );
            const otpRoundedPrices: Record<string, GpMoney> = {
              ...reviewedApprovedPrices,
              ...(await normalizeRegionalTargets(
                new Map(
                  [...changes].filter(
                    ([regionCode]) =>
                      configuredRegions.has(regionCode) &&
                      !reviewedApprovedPrices[regionCode],
                  ),
                ),
              )),
            };
            enforceFinalMovementCap();

            let writeSucceeded = false;
            const maxCorrectionAttempts =
              (po.regionalPricingAndAvailabilityConfigs?.length ?? 0) + 10;
            for (let attempt = 0; attempt < maxCorrectionAttempts; attempt++) {
              po.regionalPricingAndAvailabilityConfigs = (
                po.regionalPricingAndAvailabilityConfigs ?? []
              )
                .filter((rc) => !otpNotBillable.has(rc.regionCode))
                .map((rc) => {
                  const roundedPrice = otpRoundedPrices[rc.regionCode];
                  const storedCurrency = rc.price?.currencyCode ?? "USD";
                  const correctedCurrency =
                    otpCorrections[rc.regionCode] ??
                    requiredCurrency(
                      rc.regionCode,
                      roundedPrice?.currencyCode ?? storedCurrency,
                    );
                  if (roundedPrice) {
                    return {
                      ...rc,
                      price:
                        correctedCurrency === roundedPrice.currencyCode
                          ? roundedPrice
                          : {
                              ...roundedPrice,
                              currencyCode: correctedCurrency,
                            },
                    };
                  }
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
                // A Google-required rounding correction can change `changes`
                // between attempts. Re-check the exact payload immediately
                // before every write, not only before the first attempt.
                enforceFinalMovementCap();
                await gpFetch(
                  gpCredentials,
                  `${API}/${selectedPackage}/onetimeproducts/${selectedRef.productId}`,
                  {
                    method: "PATCH",
                    params: {
                      updateMask: "purchaseOptions",
                      "regionsVersion.version": pricingRegionsVersion,
                    },
                    body: modern,
                  },
                );
                storeAccepted = true;
                writeSucceeded = true;
                break;
              } catch (e) {
                if (!(e instanceof GpError)) throw e;
                const msg = e.message;
                const currMatch = msg.match(CURRENCY_ERR_OTP);
                const billMatch = msg.match(NOT_BILLABLE_OTP);
                const roundingMatch = msg.match(PRICE_ROUNDING_OTP);
                if (currMatch) {
                  if (otpCorrections[currMatch[1]] === currMatch[2]) {
                    throw new Error(
                      `${currMatch[1]} remained on the wrong currency after StoreOps corrected it to ${currMatch[2]}. Nothing changed; refresh before retrying.`,
                    );
                  }
                  otpCorrections[currMatch[1]] = currMatch[2];
                  reportApplyStatus(
                    "Google rejected the draft — correcting it…",
                    "Nothing changed. StoreOps is rebuilding the request with Google’s required currency.",
                    `${currMatch[1]} currency corrected to ${currMatch[2]}`,
                  );
                } else if (billMatch) {
                  otpNotBillable.add(billMatch[1]);
                  changes.delete(billMatch[1]);
                  reportApplyStatus(
                    "Google rejected the draft — correcting it…",
                    "Nothing changed. StoreOps is excluding a region Google no longer bills.",
                    `${billMatch[1]} excluded as non-billable`,
                  );
                } else if (roundingMatch) {
                  const regionCode = roundingMatch[1];
                  if (otpRoundedPrices[regionCode]) throw e;
                  const config = po.regionalPricingAndAvailabilityConfigs?.find(
                    (item) => item.regionCode === regionCode,
                  );
                  const target =
                    changes.get(regionCode) ??
                    (config?.price ? Number(moneyToDecimal(config.price)) : NaN);
                  const rounded = await resolveBillableRegionalPrice(
                    regionCode,
                    target,
                  );
                  otpRoundedPrices[regionCode] = rounded;
                  const roundedValue = Number(moneyToDecimal(rounded));
                  changes.set(regionCode, roundedValue);
                  applyWarnings.push(
                    `${regionCode}: Google-required billable rounding ${target} → ${roundedValue} ${rounded.currencyCode}`,
                  );
                  reportApplyStatus(
                    "Google rejected the draft — correcting it…",
                    "Nothing changed. StoreOps found Google’s nearest accepted regional price and is retrying.",
                    `${regionCode} rounded ${target} → ${roundedValue} ${rounded.currencyCode}`,
                  );
                } else {
                  throw e;
                }
              }
            }
            if (!writeSucceeded) {
              throw new Error(
                `Google did not accept the one-time product after ${maxCorrectionAttempts} correction attempts. No success was recorded; refresh and review the product configuration.`,
              );
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
          const PRICE_ROUNDING = /price for (\w+) must be rounded/i;
          const CURRENCY_ERR =
            /Invalid currency for region code (\w+).*Expected (\w+) but got/;
          const CONFIGS_REMOVED =
            /Regional configs were removed from the base plan: (.+)/;

          // Regions excluded from payload — only truly "not billable" ones.
          // Google allows removing these; it rejects removing priced regions.
          const notBillable = new Set<string>([...GP_NOT_BILLABLE]);
          // Runtime currency overrides learned from API errors (fallback if
          // convertRegionPrices didn't cover a region).
          const runtimeCorrections: Record<string, string> = {};
          const roundedPrices: Record<string, GpMoney> = {};
          const allWarnings: string[] = [];
          const freshSubscription = await gpFetch<GpSubscription>(
            gpCredentials,
            `${API}/${selectedPackage}/subscriptions/${selectedRef.productId}`,
          );
          const originalPlan = freshSubscription.basePlans?.find(
            (plan) => plan.basePlanId === selectedRef.basePlanId,
          );
          if (!originalPlan)
            throw new Error("Base plan not found — refresh and retry.");
          const configuredRegions = new Set(
            (originalPlan.regionalConfigs ?? []).map(
              (config) => config.regionCode,
            ),
          );
          Object.assign(
            roundedPrices,
            reviewedApprovedPrices,
            await normalizeRegionalTargets(
              new Map(
                [...changes].filter(
                  ([regionCode]) =>
                    configuredRegions.has(regionCode) &&
                    !reviewedApprovedPrices[regionCode],
                ),
              ),
            ),
          );
          enforceFinalMovementCap();

          const correctCurrency = (
            regionCode: string,
            storedCurrency: string,
          ) =>
            runtimeCorrections[regionCode] ??
            requiredCurrency(regionCode, storedCurrency);

          let writeSucceeded = false;
          const maxCorrectionAttempts =
            (originalPlan.regionalConfigs?.length ?? 0) + 10;
          for (let attempt = 0; attempt < maxCorrectionAttempts; attempt++) {
            const updated: GpSubscription = JSON.parse(
              JSON.stringify(freshSubscription),
            );
            const plan = updated.basePlans?.find(
              (b) => b.basePlanId === selectedRef.basePlanId,
            );
            if (!plan)
              throw new Error("Base plan not found — refresh and retry.");

            plan.regionalConfigs = (plan.regionalConfigs ?? [])
              .filter((rc) => !notBillable.has(rc.regionCode))
              .map((rc) => {
                if (!rc.price) return rc;
                const roundedPrice = roundedPrices[rc.regionCode];
                const correct = correctCurrency(
                  rc.regionCode,
                  roundedPrice?.currencyCode ?? rc.price.currencyCode,
                );
                if (roundedPrice) {
                  return {
                    ...rc,
                    price:
                      correct === roundedPrice.currencyCode
                        ? roundedPrice
                        : { ...roundedPrice, currencyCode: correct },
                  };
                }
                const next = changes.get(rc.regionCode);
                if (next !== undefined)
                  return { ...rc, price: decimalToMoney(next, correct) };
                return correct !== rc.price.currencyCode
                  ? { ...rc, price: { ...rc.price, currencyCode: correct } }
                  : rc;
              });

            try {
              // Keep the movement cap as a write-time invariant even after a
              // rejected draft teaches us a different billable price pattern.
              enforceFinalMovementCap();
              await gpFetch(
                gpCredentials,
                `${API}/${selectedPackage}/subscriptions/${selectedRef.productId}`,
                {
                  method: "PATCH",
                  params: {
                    updateMask: "basePlans",
                    "regionsVersion.version": pricingRegionsVersion,
                  },
                  body: updated,
                },
              );
              storeAccepted = true;
              writeSucceeded = true;
              break; // success
            } catch (e) {
              if (!(e instanceof GpError)) throw e;

              // Currency still wrong — convertRegionPrices missed this region.
              // Learn from the error and retry once.
              const currMatch = e.message.match(CURRENCY_ERR);
              if (currMatch) {
                if (runtimeCorrections[currMatch[1]] === currMatch[2]) {
                  throw new Error(
                    `${currMatch[1]} remained on the wrong currency after StoreOps corrected it to ${currMatch[2]}. Nothing changed; refresh before retrying.`,
                  );
                }
                runtimeCorrections[currMatch[1]] = currMatch[2];
                allWarnings.push(
                  `Auto-corrected currency: ${currMatch[1]} → ${currMatch[2]}`,
                );
                reportApplyStatus(
                  "Google rejected the draft — correcting it…",
                  "Nothing changed. StoreOps is rebuilding the request with Google’s required currency.",
                  `${currMatch[1]} currency corrected to ${currMatch[2]}`,
                );
                continue;
              }

              // Not billable — Google allows removing these.
              const nbMatch = e.message.match(NOT_BILLABLE);
              if (nbMatch) {
                notBillable.add(nbMatch[1]);
                changes.delete(nbMatch[1]);
                allWarnings.push(
                  `⚠ ${nbMatch[1]}: not billable in regions version ${pricingRegionsVersion} — excluded`,
                );
                reportApplyStatus(
                  "Google rejected the draft — correcting it…",
                  "Nothing changed. StoreOps is excluding a region Google no longer bills.",
                  `${nbMatch[1]} excluded as non-billable`,
                );
                continue;
              }

              // Never invent a fallback production price. Google includes the
              // valid range in this error; return it to the operator unchanged.
              const prMatch = e.message.match(PRICE_RANGE);
              if (prMatch) {
                throw new Error(
                  `${prMatch[1]} was rejected because the price is outside Google's allowed local range. Nothing was substituted. Review that row and apply again. ${e.message}`,
                );
              }

              const roundingMatch = e.message.match(PRICE_ROUNDING);
              if (roundingMatch) {
                const regionCode = roundingMatch[1];
                if (roundedPrices[regionCode]) throw e;
                const originalConfig = freshSubscription.basePlans
                  ?.find((item) => item.basePlanId === selectedRef.basePlanId)
                  ?.regionalConfigs?.find(
                    (item) => item.regionCode === regionCode,
                  );
                const target =
                  changes.get(regionCode) ??
                  (originalConfig?.price
                    ? Number(moneyToDecimal(originalConfig.price))
                    : NaN);
                const rounded = await resolveBillableRegionalPrice(
                  regionCode,
                  target,
                );
                roundedPrices[regionCode] = rounded;
                const roundedValue = Number(moneyToDecimal(rounded));
                changes.set(regionCode, roundedValue);
                allWarnings.push(
                  `${regionCode}: Google-required billable rounding ${target} → ${roundedValue} ${rounded.currencyCode}`,
                );
                reportApplyStatus(
                  "Google rejected the draft — correcting it…",
                  "Nothing changed. StoreOps found Google’s nearest accepted regional price and is retrying.",
                  `${regionCode} rounded ${target} → ${roundedValue} ${rounded.currencyCode}`,
                );
                continue;
              }

              // A priced region cannot be silently removed or replaced.
              const removedMatch = e.message.match(CONFIGS_REMOVED);
              if (removedMatch) {
                throw new Error(
                  `Google refused to remove priced regions (${removedMatch[1]}). No replacement price was invented. Refresh the product and review those regions.`,
                );
              }

              throw e;
            }
          }

          if (!writeSucceeded) {
            throw new Error(
              `Google did not accept the subscription after ${maxCorrectionAttempts} correction attempts. No success was recorded; refresh and review the base plan.`,
            );
          }

          if (allWarnings.length > 0) {
            applyWarnings.push(...allWarnings);
            setImportWarnings((prev) => [...prev, ...allWarnings]);
          }
        }

        reportApplyStatus(
          "Google accepted the pricing update",
          "The write succeeded. StoreOps is now reading the live grid to verify every requested region.",
          "Write accepted by Google Play",
        );
        const authoritative = await fetchAuthoritativePrices(selectedRef);
        const mismatches = findPriceMismatches(changes, authoritative);
        if (mismatches.length > 0) {
          throw new Error(
            `Google returned success, but verification did not match for ${mismatches
              .slice(0, 5)
              .map((item) => item.region)
              .join(", ")}${mismatches.length > 5 ? "…" : ""}. StoreOps will not report this apply as complete. Refresh and review the live grid.`,
          );
        }
        liveVerified = true;
        reportApplyStatus(
          "Live prices verified",
          "Google’s live regional grid matches the accepted update.",
          "Live grid verification passed",
        );

        setApplySummary({
          productLabel: refLabel(selectedRef),
          regionsChanged: changes.size,
          warnings: applyWarnings,
          verified: true,
        });
        setImportPreview(null);
        setGoogleApprovedPreview(null);
        setSheetText("");
        await loadProducts();
        setSelectedRefKey(refKey(selectedRef));
      } catch (e) {
        const reason =
          e instanceof GpError || e instanceof Error ? e.message : String(e);
        setError(
          !storeAccepted
            ? `Update stopped before Google accepted a pricing write. The rejected attempts changed nothing. Reason: ${reason}`
            : liveVerified
              ? `Google accepted and verified the prices, but StoreOps could not refresh the screen afterward. Reload to read the live grid. Reason: ${reason}`
              : `Google accepted the pricing write, but StoreOps could not verify the complete live grid. Some prices may have changed. Refresh before retrying. Reason: ${reason}`,
        );
      } finally {
        setApplying(false);
        setApplyStatus(null);
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
      fetchAuthoritativePrices,
    ],
  );

  async function applyImport(snapshotName?: string) {
    if (!importPreview) return;
    setSnapshotDialog(false);
    const changes = new Map(
      importPreview
        .filter((r) => r.newPrice !== r.currentPrice)
        .map((r) => [r.regionCode, Number(r.newPrice)] as const),
    );
    try {
      await takeRequiredSnapshot({
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
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
      return;
    }
    setSnapRefresh((n) => n + 1);
    await applyChanges(changes, googleApprovedPreview, previewMovementCap);
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
    try {
      await takeRequiredSnapshot({
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
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
      return;
    }
    setSnapRefresh((value) => value + 1);
    await applyChanges(changes);
  }

  function saveNamedSnapshot(label: string) {
    if (!selectedRef) return;
    try {
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
    } catch (snapshotError) {
      setError(snapshotError instanceof Error ? snapshotError.message : String(snapshotError));
      return;
    }
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
            title={applyStatus?.title ?? "Updating Google Play pricing…"}
            detail={
              applyStatus?.detail ??
              "Your regional price configuration is being sent to Google Play. Keep this page open until it finishes."
            }
            events={applyStatus?.events}
          />
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
              — its raw key material cannot be exported after import.
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
                      setGoogleApprovedPreview(null);
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
                        Controlled policy or spreadsheet
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

                  <div className="mb-4 flex gap-2 border-b border-zinc-800 pb-3">
                    <button
                      onClick={() => setPricingMode("anchor")}
                      className={`rounded-md px-3 py-1.5 text-xs transition ${pricingMode === "anchor" ? "bg-emerald-950 text-emerald-300" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      New worldwide anchor
                    </button>
                    <button
                      onClick={() => setPricingMode("adjust")}
                      className={`rounded-md px-3 py-1.5 text-xs transition ${pricingMode === "adjust" ? "bg-emerald-950 text-emerald-300" : "text-zinc-500 hover:text-zinc-200"}`}
                    >
                      Adjust current grid
                    </button>
                  </div>

                  {pricingMode === "anchor" ? (
                    <div className="mb-4">
                      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                        Google&apos;s live conversion engine builds the baseline from one USD price. Your market policy and movement cap are applied only after Google returns valid local currencies.
                      </p>
                      <div className="mb-3 grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-zinc-400">
                          <span className="mb-1 block">USA anchor</span>
                          <span className="flex items-center gap-2">
                            <span className="text-zinc-500">$</span>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={anchorUsd}
                              onChange={(event) => setAnchorUsd(Math.max(0.01, Number(event.target.value) || 0.01))}
                              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                            />
                          </span>
                        </label>
                        <label className="text-xs text-zinc-400">
                          <span className="mb-1 block">Maximum movement this apply</span>
                          <span className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={anchorMaxChangePercent}
                              onChange={(event) => setAnchorMaxChangePercent(Math.max(1, Math.min(50, Number(event.target.value) || 1)))}
                              className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 focus:border-emerald-500 focus:outline-none"
                            />
                            <span className="text-zinc-500">%</span>
                          </span>
                        </label>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {STRATEGIES.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => setStrategy(item.key)}
                            className={`rounded border px-2.5 py-1 text-xs ${strategy === item.key ? "border-emerald-700 bg-emerald-950/60 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
                          >
                            {item.emoji} {item.label}
                          </button>
                        ))}
                      </div>
                      <label className="mb-3 flex items-start gap-2 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          checked={applyFullAnchorTarget}
                          onChange={(event) => setApplyFullAnchorTarget(event.target.checked)}
                          className="mt-0.5"
                        />
                        Apply the full worldwide target now instead of staging changes within the movement cap.
                      </label>
                      <button
                        onClick={generateAnchorPreview}
                        disabled={anchorLoading || currentPrices.length === 0}
                        className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-40"
                      >
                        {anchorLoading ? "Building Google baseline…" : "Generate anchored preview"}
                      </button>
                    </div>
                  ) : (
                    <AiRepricePanel
                      getCsv={() => buildCsv(exportableRows())}
                      platform="android"
                      strategy={strategy}
                      onStrategyChange={setStrategy}
                      onResult={(data, cap) => {
                        setPreviewMovementCap(cap);
                        acceptGeneratedPolicy(data);
                      }}
                      disabled={currentPrices.length === 0}
                      onExportCsv={exportCsv}
                    />
                  )}

                  {pricingMode === "anchor" && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-zinc-800" />
                      <span className="text-xs text-zinc-600">or paste your own CSV</span>
                      <div className="h-px flex-1 bg-zinc-800" />
                    </div>
                  )}

                  <textarea
                    value={sheetText}
                    onChange={(e) => {
                      setSheetText(e.target.value);
                      setImportPreview(null);
                      setGoogleApprovedPreview(null);
                      setPreviewMovementCap(null);
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
                            setGoogleApprovedPreview(null);
                            setPreviewMovementCap(null);
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
          onSaveAndApply={(name) => applyImport(name)}
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
