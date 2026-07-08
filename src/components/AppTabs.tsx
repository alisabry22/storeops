"use client";

import Link from "next/link";

const TABS = [
  { key: "metadata", label: "Metadata", href: (id: string) => `/apps/${id}` },
  {
    key: "pricing",
    label: "Pricing",
    href: (id: string) => `/apps/${id}/pricing`,
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
    <div className="flex items-center gap-1 mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 w-fit">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(appId)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            active === t.key
              ? "bg-emerald-500 text-zinc-950"
              : "text-zinc-400 hover:text-zinc-100"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
