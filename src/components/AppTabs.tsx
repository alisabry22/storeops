"use client";

import Link from "next/link";
import { AppIcon, type AppIconName } from "./AppIcon";

const TABS = [
  { key: "metadata", label: "Store listing", description: "Descriptions & release notes", icon: "listing", path: "" },
  { key: "pricing", label: "App price", description: "The price to download your app", icon: "price", path: "/pricing" },
  { key: "subscriptions", label: "Subscriptions", description: "Monthly, yearly & local prices", icon: "plans", path: "/subscriptions" },
  { key: "iap", label: "In-app products", description: "Unlocks, credits & one-time buys", icon: "product", path: "/iap" },
] as const;

export type AppTabKey = typeof TABS[number]["key"];

export function AppTabs({ appId, active }: { appId: string; active?: AppTabKey }) {
  return <nav aria-label="App tools" className="mb-8 grid grid-cols-2 gap-2 lg:grid-cols-4">
    {TABS.map((tab) => <Link key={tab.key} href={"/apps/" + appId + tab.path}
      aria-current={active === tab.key ? "page" : undefined}
      className={"flex min-h-20 items-start gap-3 rounded-lg border p-3 transition-colors " +
        (active === tab.key ? "border-emerald-600 bg-emerald-950/20 text-emerald-200" : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50")}>
      <AppIcon name={tab.icon as AppIconName} className="mt-0.5 hidden size-5 shrink-0 sm:block" />
      <span className="min-w-0"><span className="block text-sm font-medium">{tab.label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{tab.description}</span></span>
    </Link>)}
  </nav>;
}
