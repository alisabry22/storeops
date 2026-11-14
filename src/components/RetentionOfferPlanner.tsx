"use client";

import { useState } from "react";
import type { AscCredentials } from "@/lib/asc/jwt";
import type { Subscription } from "@/lib/asc/types";
import { ascFetchAllFull } from "@/lib/asc/client";
import { readSubscriptionPrices, fetchSubscriptionPricePoints } from "@/lib/asc/subscription-pricing";
import { activeSubscriptionPrices } from "@/lib/plan-pricing";
import { buildRetentionPreview, type RetentionPriceRow, type RetentionTier } from "@/lib/retention-pricing";

export function RetentionOfferPlanner({ credentials, subscriptions }: { credentials: AscCredentials; subscriptions: Subscription[] }) {
  const [selected, setSelected] = useState("");
  const [discount, setDiscount] = useState(25);
  const [rows, setRows] = useState<RetentionPriceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [offerCount, setOfferCount] = useState<number | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  async function preview() {
    setBusy(true); setRows([]); setOfferCount(null); setMessage("");
    try {
      const prices = activeSubscriptionPrices(await readSubscriptionPrices(credentials, selected));
      if (!prices.length) throw new Error("This subscription has no active local prices.");
      const catalogue = new Map<string, RetentionTier[]>();
      for (let offset = 0; offset < prices.length; offset += 20) {
        setMessage(`Loading local price points: ${offset} / ${prices.length}`);
        const points = await fetchSubscriptionPricePoints(credentials, selected, prices.slice(offset, offset + 20).map(p => p.territoryId));
        for (const point of points) {
          const territory = point.relationships?.territory?.data;
          if (!territory || Array.isArray(territory)) throw new Error("Apple returned a price point without its territory.");
          const bucket = catalogue.get(territory.id) ?? [];
          bucket.push({ id: point.id, price: point.attributes.customerPrice }); catalogue.set(territory.id, bucket);
        }
      }
      setRows(buildRetentionPreview(prices, catalogue, discount)); setGeneratedAt(new Date().toISOString());
      setMessage("Preview ready. No store prices have been changed.");
      try {
        const offers = await ascFetchAllFull(credentials, `/v1/subscriptions/${selected}/retentionOffers`, { limit: "200" });
        setOfferCount(offers.data.length);
      } catch (error) { setMessage(`Price preview ready. Existing retention offers could not be loaded: ${error instanceof Error ? error.message : "Apple request failed"}`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load pricing."); }
    finally { setBusy(false); }
  }
  function download() {
    const data = { platform: "appstore", subscriptionId: selected, generatedAt, requestedDiscountPercent: discount, status: "preview_only", rows };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `retention-${selected}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <details className="mb-8 rounded-lg border border-zinc-800 p-5">
    <summary className="cursor-pointer text-lg font-medium">Retention offer pricing</summary>
    <p className="my-3 text-sm text-zinc-400">Preview a discount against each country’s current subscription price, rounded to an available Apple price point.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Subscription<select className="mt-1 block rounded border border-zinc-700 bg-zinc-950 p-2" value={selected} disabled={busy} onChange={e => { setSelected(e.target.value); setRows([]); setMessage(""); }}>
        <option value="">Choose a subscription</option>{subscriptions.map(s => <option key={s.id} value={s.id}>{s.attributes.name} · {s.attributes.productId}</option>)}
      </select></label>
      <label className="text-sm">Discount (%)<input className="mt-1 block w-28 rounded border border-zinc-700 bg-zinc-950 p-2" type="number" min={5} max={75} value={discount} disabled={busy} onChange={e => { setDiscount(Number(e.target.value)); setRows([]); }} /></label>
      <button type="button" disabled={!selected || busy} onClick={() => void preview()} className="rounded bg-emerald-700 px-4 py-2 disabled:opacity-40">{busy ? "Loading…" : "Preview local offers"}</button>
      {rows.length > 0 && <button type="button" onClick={download} className="rounded border border-zinc-600 px-4 py-2">Export preview</button>}
    </div>
    <p role="status" className="my-3 text-sm">{message}</p>
    {offerCount !== null && <p className="mb-3 text-sm text-zinc-400">{offerCount} existing retention offers on this subscription.</p>}
    {rows.length > 0 && <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{["Territory", "Currency", "Current", "Offer", "Discount", "Check"].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.territoryId} className="border-t border-zinc-800"><td className="p-2">{r.territoryId}</td><td>{r.currency}</td><td>{r.customerPrice}</td><td>{r.offerPrice ?? "Unavailable"}</td><td>{r.discountPercent?.toFixed(1) ?? "—"}%</td><td>{r.warning ?? "Within target range"}</td></tr>)}</tbody></table></div>}
    <p className="mt-4 text-xs text-zinc-400">Preview and export only. Apple’s published API 4.6 inline retention-price schema does not describe territory/price-point selection. Creating offers is unavailable until that request format is confirmed. Google Play cancellation offers use a different platform flow; this Apple planner does not configure them.</p>
  </details>;
}
