"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { annualSavings, type PlanPricingRow, type PlanPricingSettings } from "@/lib/plan-pricing";
import type { PlanPricingStore, PlanReference, PairedPricingPreview, PlanApplyResult } from "@/lib/plan-pricing-store";
import { useIsPro } from "@/lib/license";
import { isCommunityEdition } from "@/lib/edition";
import { PaywallModal } from "./Paywall";
import { UpdateStatus } from "./UpdateStatus";
import { WorkflowSteps } from "./WorkflowSteps";
import { PricingStrategyPicker } from "./PricingStrategyPicker";
import { AppIcon } from "./AppIcon";
import { territoryName } from "@/lib/territory-names";

// Extend the existing subscription workspace: paired country rows are the focal
// element; Geist/zinc/emerald, native controls, 4px rhythm, compact 14px data.
// Selection → USA anchors → market policy → paired preview → confirmed apply.
const control = "min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50";
const secondary = "min-h-11 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50";
const primary = "min-h-11 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";
const roles = ["monthly", "yearly"] as const;
type Role = typeof roles[number];

function money(value: string | number, currency: string): string {
  try { return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value)); }
  catch { return `${value} ${currency}`; }
}

function PriceComparison({ cell, currency }: { cell: PlanPricingRow["monthly"]; currency: string }) {
  if (!cell) return <span className="text-zinc-400">Unavailable</span>;
  return <div className="space-y-1 tabular-nums">
    <div className="text-xs text-zinc-400">{cell.currentPrice === null ? "Not set" : money(cell.currentPrice, currency)} <span aria-hidden="true">→</span></div>
    <div className="font-mono font-medium text-zinc-100">{money(cell.price, currency)}</div>
    <div className="text-xs text-zinc-400">{cell.changePercent === null ? "New price" : !cell.changed ? "Unchanged" : Math.abs(cell.changePercent) < 0.05 ? "<0.1% change" : `${cell.changePercent > 0 ? "+" : ""}${cell.changePercent.toFixed(1)}%`}{cell.staged ? " · limited" : ""}</div>
  </div>;
}

export function PlanPricingWorkspace({ store, loading, onBusyChange }: {
  store: PlanPricingStore;
  loading: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const isPro = useIsPro();
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 0) headingRef.current?.focus({ preventScroll: true }); }, [step]);
  const [selected, setSelected] = useState({ monthly: "", yearly: "" });
  const [points, setPoints] = useState<Record<Role, PlanReference[]>>({ monthly: [], yearly: [] });
  const [anchors, setAnchors] = useState({ monthly: "", yearly: "" });
  const [settings, setSettings] = useState<PlanPricingSettings>({ strategy: "ppp", relationship: "reference-discount", annualDiscountPercent: 40, maxChangePercent: 25 });
  const [sameBenefits, setSameBenefits] = useState(false);
  const [preview, setPreview] = useState<PairedPricingPreview | null>(null);
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"anchors" | "preview" | "apply" | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState<PlanApplyResult[]>([]);
  const [preserve, setPreserve] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [paywall, setPaywall] = useState(false);

  function setActivity(value: typeof busy) { setBusy(value); onBusyChange(value !== null); }
  function invalidate() { setPreview(null); setConfirm(false); setAcknowledged(false); setError(""); setResults([]); }
  function updateSettings(update: Partial<PlanPricingSettings>) { invalidate(); setSettings((current) => ({ ...current, ...update })); }
  function selectPlan(role: Role, subscriptionId: string) {
    invalidate();
    setSelected((current) => ({ ...current, [role]: current[role] === subscriptionId ? "" : subscriptionId }));
    setPoints({ monthly: [], yearly: [] });
    setAnchors({ monthly: "", yearly: "" });
    setSameBenefits(false);
  }

  const bothSelected = !!selected.monthly && !!selected.yearly;
  const groupIds = Object.fromEntries(store.plans.map((plan) => [plan.id, plan.groupId]));
  const groupMismatch = store.requireMatchingGroup && bothSelected && (!groupIds[selected.monthly] || !groupIds[selected.yearly] || groupIds[selected.monthly] !== groupIds[selected.yearly]);
  const referenceMonthly = Number(store.referenceMode === "amount" ? anchors.monthly : points.monthly.find((point) => point.id === anchors.monthly)?.price);
  const referenceYearly = Number(store.referenceMode === "amount" ? anchors.yearly : points.yearly.find((point) => point.id === anchors.yearly)?.price);
  const referenceSavings = annualSavings(referenceMonthly, referenceYearly);
  const yearlyTarget = referenceMonthly * 12 * (1 - settings.annualDiscountPercent / 100);
  const calculatedYearly = store.referenceMode === "amount" ? yearlyTarget : Number(points.yearly.reduce<PlanReference | undefined>((nearest, point) => !nearest || Math.abs(Number(point.price) - yearlyTarget) < Math.abs(Number(nearest.price) - yearlyTarget) ? point : nearest, undefined)?.price);
  const eligible = preview?.rows.filter((row) => row.issues.length === 0) ?? [];
  const chosen = eligible.filter((row) => countries.has(row.territoryId));
  const writes = chosen.flatMap((row) => [row.monthly!, row.yearly!]).filter((cell) => cell.changed);
  const decreaseCount = writes.filter((cell) => cell.changePercent !== null && cell.changePercent < 0).length;
  const largeCount = writes.filter((cell) => cell.changePercent !== null && Math.abs(cell.changePercent) > 25).length;
  const needsAcknowledgement = (store.platform === "apple" && decreaseCount > 0) || largeCount > 0;
  const finished = results.length > 0;
  const visible = useMemo(() => {
    const query = filter.trim().toUpperCase();
    return preview?.rows.filter((row) => `${territoryName(row.territoryId)} ${row.territoryId} ${row.currency}`.toUpperCase().includes(query)) ?? [];
  }, [preview, filter]);

  async function loadAnchors() {
    invalidate();
    setActivity("anchors");
    try {
      setProgress("Loading your current US prices…");
      const loaded = await store.loadReferences(selected);
      setPoints({ monthly: loaded.monthly.options, yearly: loaded.yearly.options });
      setAnchors({ monthly: loaded.monthly.selectedId, yearly: loaded.yearly.selectedId });
      setStep(1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setActivity(null); }
  }

  async function generate() {
    invalidate();
    if (settings.relationship === "target-discount" && (!Number.isFinite(settings.annualDiscountPercent) || settings.annualDiscountPercent <= 0 || settings.annualDiscountPercent >= 100)) {
      setError("Choose an annual discount between 1% and 99%.");
      return;
    }
    setActivity("preview");
    setProgress(`Reading both plans and ${store.name}’s localized baselines…`);
    try {
      const next = await store.createPreview(selected, anchors, settings, setProgress);
      const rows = next.rows;
      if (!rows.length) throw new Error(`${store.name} returned no countries for this pair. Try reloading the USA prices.`);
      setPreview(next);
      setCountries(new Set(rows.filter((row) => row.issues.length === 0).map((row) => row.territoryId)));
      setFilter("");
      setStep(2);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setActivity(null); }
  }

  async function apply() {
    if (!preview || !writes.length || (needsAcknowledgement && !acknowledged)) return;
    if (!isPro) { setPaywall(true); return; }
    setConfirm(false);
    setError("");
    setActivity("apply");
    setProgress("Re-reading both plans and saving both recovery snapshots…");
    try {
      await preview.apply({ rows: chosen, preserveExistingSubscribers: preserve, onResults: (next) => {
        setResults(next);
        const active = next.find((result) => result.status === "applying");
        if (active) setProgress(`${active.name}: ${active.accepted}/${active.total} changes accepted; verifying against ${store.name} before continuing.`);
      } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setActivity(null); setStep(3); }
  }

  function exportPreview() {
    if (!preview) return;
    const csv = ["territory,currency,selected,monthly_current,monthly_proposed,yearly_current,yearly_proposed,yearly_monthly_equivalent,annual_savings_percent", ...preview.rows.map((row) => [row.territoryId, row.currency, countries.has(row.territoryId), row.monthly?.currentPrice ?? "", row.monthly?.price ?? "", row.yearly?.currentPrice ?? "", row.yearly?.price ?? "", row.yearly ? (Number(row.yearly.price) / 12).toFixed(4) : "", row.savingsPercent?.toFixed(2) ?? ""].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = "monthly-yearly-pricing-preview.csv"; link.click(); URL.revokeObjectURL(url);
  }


  function toggleCountry(territoryId: string, checked: boolean) {
    setCountries((current) => {
      const next = new Set(current);
      if (checked) next.add(territoryId); else next.delete(territoryId);
      return next;
    });
    setConfirm(false);
    setAcknowledged(false);
  }

  function countryCheckbox(row: PlanPricingRow) {
    return <label className="flex min-h-11 items-center gap-3">
      <input type="checkbox" className="size-4 shrink-0 accent-emerald-500"
        aria-label={"Include " + territoryName(row.territoryId)}
        checked={countries.has(row.territoryId)}
        disabled={busy !== null || finished || row.issues.length > 0}
        onChange={(event) => toggleCountry(row.territoryId, event.target.checked)} />
      <span><span className="block font-medium text-zinc-100">{territoryName(row.territoryId)}</span>
        <span className="block text-xs text-zinc-400">{row.currency} · {row.territoryId}</span></span>
    </label>;
  }

  const titles = ["Choose your plans", "Set your prices", "Preview every country", "Your pricing results"];

  return <section aria-label="Price plans together" className="space-y-6">
    <WorkflowSteps steps={["Plans", "Prices", "Preview", "Results"]} current={step}
      disabled={busy !== null || finished} onStep={setStep} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold tracking-tight outline-none">{titles[step]}</h2>
        <p className="mt-1 text-sm text-zinc-400">{[
          "One monthly plan. One yearly plan. Price them together.",
          "Choose US prices. We’ll calculate both plans for other countries.",
          "Review both prices before anything changes in the store.",
          `Each plan is checked separately with ${store.name}.`,
        ][step]}</p>
      </div>
      {step > 0 && step < 3 && <button type="button" className={secondary + " shrink-0"} disabled={busy !== null}
        onClick={() => setStep(step - 1)}>Back</button>}
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</p>}
    {busy && <UpdateStatus title={busy === "apply" ? "Applying your prices…" : busy === "anchors" ? "Loading your US prices…" : "Calculating local prices…"} detail={progress} />}

    {step === 0 && <fieldset disabled={busy !== null || loading} className="min-w-0 space-y-5">
      <legend className="sr-only">Choose two subscription plans</legend>
      {loading ? <p role="status" className="text-sm text-zinc-400">Loading subscriptions…</p> :
        <div className="grid gap-5 sm:grid-cols-2">{roles.map((role) => {
          const options = store.plans.filter((plan) => plan.period === role);
          return <fieldset key={role} className="min-w-0">
            <legend className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <AppIcon name={role === "monthly" ? "price" : "plans"} />{role === "monthly" ? "Monthly" : "Yearly"}
            </legend>
            {!options.length && <p className="text-sm text-zinc-400">Create a {role} plan in {store.platform === "apple" ? "App Store Connect" : "Play Console"}, then refresh.</p>}
            <div className="max-h-64 space-y-2 overflow-y-auto">{options.map((sub) =>
              <label key={sub.id} className={"flex min-h-20 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 " +
                (selected[role] === sub.id ? "border-emerald-600 bg-emerald-950/20" : "border-zinc-700 hover:border-zinc-500")}>
                <input type="checkbox" className="size-4 shrink-0 accent-emerald-500"
                  checked={selected[role] === sub.id} onChange={() => selectPlan(role, sub.id)} />
                <span className="min-w-0"><span className="block text-sm font-medium">{sub.name}</span>
                  <span className="mt-1 block break-all text-xs text-zinc-400">{sub.productId}</span></span>
              </label>)}</div>
          </fieldset>;
        })}</div>}
      {groupMismatch && <p role="alert" className="text-sm text-amber-200">Choose plans from the same subscription group.</p>}
      {bothSelected && !groupMismatch && <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-zinc-300">
        <input type="checkbox" checked={sameBenefits} className="size-4 shrink-0 accent-emerald-500"
          onChange={(event) => { invalidate(); setSameBenefits(event.target.checked); }} />
        Same features, different billing periods.
      </label>}
      <button type="button" className={primary} disabled={!bothSelected || !!groupMismatch || !sameBenefits || busy !== null}
        onClick={loadAnchors}>Continue to prices <AppIcon name="arrow" className="ml-2 inline size-4" /></button>
    </fieldset>}

    {step === 1 && <fieldset disabled={busy !== null} className="min-w-0 space-y-6">
      <legend className="sr-only">Set reference prices and a pricing goal</legend>
      <div className="grid gap-4 sm:grid-cols-2">{roles.map((role) =>
        <label key={role} className="min-w-0 rounded-xl border border-zinc-700 bg-zinc-900/40 p-5">
          <span className="mb-3 flex items-center gap-2 text-sm text-zinc-300">
            <AppIcon name={role === "monthly" ? "price" : "plans"} />{role === "monthly" ? "Monthly · USD" : "Yearly · USD"}
          </span>
          {role === "yearly" && settings.relationship === "target-discount" ?
            <input className={control + " font-mono text-lg"} readOnly value={calculatedYearly > 0 ? money(calculatedYearly, "USD") : "Set a discount"} /> : store.referenceMode === "amount" ?
            <input className={control + " font-mono text-lg"} type="number" inputMode="decimal" min="0.01" step="0.01" value={anchors[role]}
              onChange={(event) => { invalidate(); setAnchors((current) => ({ ...current, [role]: event.target.value })); }} /> :
            <select className={control + " font-mono text-lg"} value={anchors[role]}
              onChange={(event) => { invalidate(); setAnchors((current) => ({ ...current, [role]: event.target.value })); }}>
              {points[role].map((point) => <option key={point.id} value={point.id}>{money(point.price, "USD")}</option>)}
            </select>}
          <span className="mt-2 block text-xs text-zinc-400">{role === "monthly" ? "Billed every month" : "Billed once a year"}</span>
        </label>)}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium text-emerald-300"><AppIcon name="check" />
          {settings.relationship === "target-discount" ? settings.annualDiscountPercent + "% target annual savings" :
            Number.isFinite(referenceSavings) ? referenceSavings.toFixed(1) + "% annual savings" : "Set both prices"}
        </span><span className="text-xs text-zinc-400">Compared with 12 monthly payments</span>
      </div>
      <PricingStrategyPicker value={settings.strategy} onChange={(strategy) => updateSettings({ strategy })} />
      <details className="app-advanced">
        <summary>Discount &amp; price protection</summary>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-zinc-300"><span className="mb-2 block">Yearly pricing</span>
            <select className={control} value={settings.relationship}
              onChange={(event) => updateSettings({ relationship: event.target.value as PlanPricingSettings["relationship"] })}>
              <option value="reference-discount">Keep the US annual discount everywhere</option>
              <option value="target-discount">Choose a target annual discount</option>
              <option value="independent">Localize each plan separately</option>
            </select>
          </label>
          <label className="text-sm text-zinc-300"><span className="mb-2 block">Limit changes to existing prices</span>
            <select className={control} value={settings.maxChangePercent === null ? "full" : String(settings.maxChangePercent)}
              onChange={(event) => updateSettings({ maxChangePercent: event.target.value === "full" ? null : Number(event.target.value) })}>
              <option value="10">Up to 10%</option><option value="25">Up to 25% · default</option>
              <option value="50">Up to 50%</option><option value="full">No limit · full target for launch</option>
            </select>
          </label>
          {settings.relationship === "target-discount" && <label className="text-sm text-zinc-300">
            <span className="mb-2 block">Target yearly discount (%)</span>
            <input className={control} type="number" min={1} max={99} step={1} value={settings.annualDiscountPercent}
              onChange={(event) => updateSettings({ annualDiscountPercent: Number(event.target.value) })} />
          </label>}
        </div>
        <p className="mt-3 text-xs text-zinc-400">{store.name}’s available prices and your change limit can affect the final discount. Your preview shows the actual savings.</p>
      </details>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" className={primary} disabled={busy !== null} onClick={generate}>Preview both plans worldwide <AppIcon name="arrow" className="ml-2 inline size-4" /></button>
        <span className="flex items-center gap-2 text-xs text-zinc-400"><AppIcon name="shield" className="size-4" />
          {settings.maxChangePercent === null ? "Full target selected" : "Existing prices protected by a " + settings.maxChangePercent + "% limit"}
        </span>
      </div>
    </fieldset>}

    {step === 2 && preview && <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-300"><strong className="text-zinc-100">{chosen.length}</strong> {chosen.length === 1 ? "country" : "countries"} · <strong className="text-zinc-100">{writes.length}</strong> {writes.length === 1 ? "price change" : "price changes"}
          {preview.rows.length > eligible.length && <span className="ml-2 text-amber-200">{preview.rows.length - eligible.length} need attention</span>}
        </div>
        <button type="button" className={secondary} onClick={exportPreview}>Download comparison</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="size-4 accent-emerald-500" checked={eligible.length > 0 && countries.size === eligible.length}
            disabled={busy !== null || finished || !eligible.length}
            onChange={(event) => { setCountries(new Set(event.target.checked ? eligible.map((row) => row.territoryId) : [])); setConfirm(false); setAcknowledged(false); }} />
          All available countries
        </label>
        <label className="min-w-0 text-sm"><span className="sr-only">Search countries or currencies</span>
          <input className={control} placeholder="Search countries…" value={filter} onChange={(event) => setFilter(event.target.value)} />
        </label>
      </div>
      {store.platform === "google" && <p className="text-xs text-zinc-400">Configured countries only. Your store availability stays the same.</p>}
      {chosen.some((row) => row.monthly?.staged || row.yearly?.staged) &&
        <p className="text-sm text-amber-200">Some prices are limited by your {preview.settings.maxChangePercent}% protection. Adjust it under “Discount &amp; price protection” to reach the full target.</p>}
      <div className="pricing-desktop-countries max-h-[32rem] overflow-auto rounded-lg border border-zinc-800" tabIndex={0} role="region" aria-label="Worldwide monthly and yearly price comparison">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Current and proposed monthly and yearly prices, yearly monthly equivalents, and actual annual savings.</caption>
          <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-300"><tr>
            <th scope="col" className="px-4 py-3">Country</th><th scope="col" className="px-4 py-3">Monthly</th>
            <th scope="col" className="px-4 py-3">Yearly</th><th scope="col" className="px-4 py-3">Yearly per month</th>
            <th scope="col" className="px-4 py-3">You save</th>
          </tr></thead>
          <tbody>{visible.map((row) => <tr key={row.territoryId} className="country-price-row border-t border-zinc-800">
            <th scope="row" className="px-4 py-3 align-top font-normal">{countryCheckbox(row)}</th>
            <td className="px-4 py-3 align-top"><PriceComparison cell={row.monthly} currency={row.currency} /></td>
            <td className="px-4 py-3 align-top"><PriceComparison cell={row.yearly} currency={row.currency} /></td>
            <td className="px-4 py-3 align-top font-mono text-zinc-300">{row.yearly ? money(Number(row.yearly.price) / 12, row.currency) : "—"}</td>
            <td className="max-w-52 px-4 py-3 align-top">
              <span className={row.issues.length ? "text-amber-200" : "font-medium tabular-nums text-emerald-300"}>{row.savingsPercent === null ? "Unavailable" : row.savingsPercent.toFixed(1) + "%"}</span>
              {row.issues.map((issue) => <p key={issue} className="mt-1 text-xs text-amber-200">{issue}</p>)}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="pricing-mobile-countries" aria-label="Country price comparisons">
        {visible.map((row) => <article key={row.territoryId} className="rounded-xl border border-zinc-700 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">{countryCheckbox(row)}
            {row.savingsPercent !== null && <span className="text-sm font-medium tabular-nums text-emerald-300">{row.savingsPercent.toFixed(1)}% yearly savings</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><p className="mb-2 text-xs text-zinc-400">Monthly</p><PriceComparison cell={row.monthly} currency={row.currency} /></div>
            <div><p className="mb-2 text-xs text-zinc-400">Yearly</p><PriceComparison cell={row.yearly} currency={row.currency} /></div>
          </div>
          {row.yearly && <p className="mt-3 border-t border-zinc-800 pt-3 text-xs text-zinc-300">Yearly works out to {money(Number(row.yearly.price) / 12, row.currency)}/month</p>}
          {row.issues.map((issue) => <p key={issue} className="mt-2 text-xs text-amber-200">{issue}</p>)}
        </article>)}
      </div>
      {!visible.length && <p className="py-6 text-sm text-zinc-400">No matches. Try a country name or currency.</p>}
      <div className="space-y-3 border-t border-zinc-800 pt-5">
        {store.platform === "apple" ? <label className="flex min-h-11 items-start gap-3 text-sm text-zinc-300">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-emerald-500" checked={preserve} disabled={busy !== null}
            onChange={(event) => { setPreserve(event.target.checked); setConfirm(false); }} />
          Keep existing subscribers’ prices for increases, where Apple allows it.
        </label> : <p className="flex items-center gap-2 text-sm text-zinc-300"><AppIcon name="shield" />For new buyers only. Existing subscribers keep their prices.</p>}
        {store.platform === "apple" && decreaseCount > 0 && <p className="text-sm text-amber-200">{decreaseCount} decreases will also lower existing subscribers’ renewal prices.</p>}
        {needsAcknowledgement && <label className="flex min-h-11 items-start gap-3 text-sm text-amber-200">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-amber-500" checked={acknowledged} disabled={busy !== null}
            onChange={(event) => { setAcknowledged(event.target.checked); setConfirm(false); }} />
          <span>I reviewed the subscriber impact{largeCount > 0 ? " and " + largeCount + (largeCount === 1 ? " change" : " changes") + " over 25%" : ""}. Completed charges cannot be undone.</span>
        </label>}
        {confirm ? <div className="space-y-3 rounded-lg border border-amber-900 bg-amber-950/20 p-4" role="group" aria-label="Confirm applying both plans">
          <p className="text-sm text-amber-100">Apply {writes.length} price changes across {chosen.length} countries?</p>
          <p className="text-xs text-amber-200">We’ll save both backups first. {store.platform === "apple" ? "Apple applies prices separately; a failed run can leave one plan updated. Scheduled changes in these countries may be replaced." : "Base plans in one product are updated together. Different products are updated separately; a failed run can leave one updated. Existing subscriber cohorts will not be migrated."}</p>
          {isCommunityEdition && <p className="text-xs text-amber-200">Backups stay in this browser. For separate copies before applying, save and download a backup from Price backups in each plan’s individual view.</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy !== null} onClick={apply}>Save backups &amp; apply</button>
            <button type="button" className={secondary} onClick={() => setConfirm(false)}>Keep reviewing</button></div>
        </div> : <button type="button" className={primary} disabled={busy !== null || !writes.length || (needsAcknowledgement && !acknowledged)}
          onClick={() => isPro ? setConfirm(true) : setPaywall(true)}>Review &amp; apply both plans</button>}
        {!writes.length && <p className="text-sm text-zinc-400">{chosen.length ? "Both plans already match. No changes needed." : "Select a country to continue."}</p>}
      </div>
    </div>}

    {step === 3 && <div className="space-y-4" role="status" aria-live="polite">
      {results.map((result) => <div key={result.subscriptionId} className="flex gap-3 rounded-lg border border-zinc-700 p-4">
        <AppIcon name={result.status === "verified" ? "check" : "help"} className={"mt-0.5 size-5 shrink-0 " + (result.status === "verified" ? "text-emerald-300" : "text-amber-200")} />
        <div className="min-w-0"><h3 className="text-sm font-medium">{result.name}</h3>
          <p className="mt-1 text-sm text-zinc-300">{result.status === "verified" ? `Verified with ${store.name}` : result.status === "failed" ? "Needs review" : "Not started"}</p>
          <p className="mt-1 text-xs text-zinc-400">{result.accepted} of {result.total} changes accepted</p>
          {result.error && <p className="mt-2 break-words text-xs text-amber-200">{result.error}</p>}
        </div>
      </div>)}
      <p className="text-sm text-zinc-400">Saved backups are under “Price backups” in each plan’s individual view.</p>
      <button type="button" className={secondary} onClick={() => { invalidate(); setStep(1); }}>Create a new preview</button>
    </div>}
    <PaywallModal open={paywall} onClose={() => setPaywall(false)} pending={{ count: writes.length, unit: "subscription price changes", manualMinutes: Math.max(5, writes.length) }} />
  </section>;
}
