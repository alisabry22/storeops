/**
 * Best-effort server sync for snapshots. localStorage remains the offline
 * cache and source for signed-out users; when an account session exists,
 * every snapshot is also written server-side so it survives cache clears
 * and follows the user across devices. Optional sync operations fail softly;
 * revenue-affecting writes inspect the returned result and require the cloud
 * copy when StoreOps accounts are configured.
 */
"use client";

import type { PriceSnapshot } from "./snapshots";
import { isCommunityEdition } from "./edition";

const clerkEnabled =
  !isCommunityEdition && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function likelySignedIn(): boolean {
  // Clerk session cookies may be HttpOnly, so client JavaScript cannot reliably
  // inspect them. Let the authenticated API answer instead of guessing.
  return clerkEnabled && typeof window !== "undefined";
}

export interface SnapshotSyncResult {
  status: "synced" | "local-only";
  /** True when StoreOps accounts are configured and a cloud copy is expected. */
  cloudExpected: boolean;
  error?: string;
}

function announceSync(status: "synced" | "local-only", id: string) {
  window.dispatchEvent(
    new CustomEvent("storeops:snapshot-sync", { detail: { status, id } })
  );
}

export async function pushSnapshotToServer(
  snapshot: PriceSnapshot
): Promise<SnapshotSyncResult> {
  if (!likelySignedIn()) {
    announceSync("local-only", snapshot.id);
    return { status: "local-only", cloudExpected: false };
  }
  try {
    const response = await fetch("/api/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    const status = response.ok ? "synced" : "local-only";
    announceSync(status, snapshot.id);
    if (response.ok) return { status, cloudExpected: true };
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    return {
      status,
      cloudExpected: true,
      error: body?.error ?? `Snapshot cloud sync returned ${response.status}.`,
    };
  } catch (error) {
    announceSync("local-only", snapshot.id);
    return {
      status: "local-only",
      cloudExpected: true,
      error: error instanceof Error ? error.message : "Snapshot cloud sync failed.",
    };
  }
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
      `/api/snapshots?appId=${encodeURIComponent(appId)}&scope=${encodeURIComponent(scope)}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const json: { snapshots: PriceSnapshot[] } = await res.json();
    return Array.isArray(json.snapshots) ? json.snapshots : [];
  } catch {
    return [];
  }
}
