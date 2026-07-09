"use client";

import Link from "next/link";

const TABS = [
  {
    key: "metadata",
    label: "Metadata",
    icon: "📝",
    href: (id: string) => `/apps/${id}`,
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: "💰",
    href: (id: string) => `/apps/${id}/pricing`,
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    icon: "🔄",
    href: (id: string) => `/apps/${id}/subscriptions`,
  },
] as const;

export type AppTabKey = (typeof TABS)[number]["key"];

export function AppTabs({
  appId,
  active,
}: {
  appId: string;
  active: AppTabKey;
}) {
  return (
    <div className="flex items-center gap-1 mb-8 rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-1 w-fit">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(appId)}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
            active === t.key
              ? "bg-emerald-500 text-zinc-950 shadow-[0_0_16px_rgba(16,185,129,0.25)]"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
          }`}
        >
          <span className="text-xs">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
