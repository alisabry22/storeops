/**
 * Best-effort server sync for snapshots. localStorage remains the offline
 * cache and source for signed-out users; when an account session exists,
 * every snapshot is also written server-side so it survives cache clears
 * and follows the user across devices. All calls fail silently — sync
 * must never break the pricing flow.
 */
"use client";

import type { PriceSnapshot } from "./snapshots";

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

/** Cheap signed-in check without importing Clerk (session cookie presence). */
function likelySignedIn(): boolean {
  return (
    clerkEnabled &&
    typeof document !== "undefined" &&
    document.cookie.includes("__session")
  );
}

export function pushSnapshotToServer(snapshot: PriceSnapshot): void {
  if (!likelySignedIn()) return;
  void fetch("/api/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot),
  }).catch(() => {});
}

export function deleteSnapshotFromServer(id: string): void {
  if (!likelySignedIn()) return;
  void fetch(`/api/snapshots?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});
}

export async function fetchServerSnapshots(
  appId: string,
  scope: string
): Promise<PriceSnapshot[]> {
  if (!likelySignedIn()) return [];
  try {
    const res = await fetch(
      `/api/snapshots?appId=${encodeURIComponent(appId)}&scope=${encodeURIComponent(scope)}`
    );
    if (!res.ok) return [];
    const json: { snapshots: PriceSnapshot[] } = await res.json();
    return Array.isArray(json.snapshots) ? json.snapshots : [];
  } catch {
    return [];
  }
}
