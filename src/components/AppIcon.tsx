import type { CSSProperties } from "react";

const paths = {
  listing: "M8 3h8l4 4v14H4V3h4m7 0v5h5M8 12h8M8 16h6",
  price: "M12 3v18m4-14H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7",
  plans: "M4 5h7v15H4zM14 3h7v17h-7zM6 9h3m7-2h3M6 13h3m7-2h3",
  product: "m3 7 9-4 9 4v11l-9 4-9-4V7zm0 0 9 4 9-4M12 11v11",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-4 5-4 13 0 18 4-5 4-13 0-18Z",
  growth: "m4 8 5 5 4-4 7 7m-6 0h6v-6",
  revenue: "m4 16 5-5 4 4 7-9m-6 0h6v6",
  retention: "M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3M12 14v3",
  enterprise: "M4 7h16v14H4zM8 7V3h8v4M4 12h16M10 12v3h4v-3",
  check: "m5 12 4 4L19 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01",
  history: "M4 4v5h5M4 9a9 9 0 1 1-1 6m9-8v6l4 2",
} as const;

export type AppIconName = keyof typeof paths;

export function AppIcon({ name, className = "size-5", style }: { name: AppIconName; className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
