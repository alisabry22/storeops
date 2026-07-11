/**
 * Pre-apply snapshots — the undo button for people's income.
 * Before every write to Apple we save the current state locally so one
 * click restores it. Stored in localStorage, capped per scope.
 */
"use client";

export interface SnapshotRow {
  territoryId: string;
  pricePointId: string;
  customerPrice: string;
  currency: string;
  manual?: boolean;
}

export interface PriceSnapshot {
  id: string;
  createdAt: string; // ISO
  appId: string;
  /** "app-pricing" or `sub:${subscriptionId}` */
  scope: string;
  label: string;
  baseTerritory?: string;
  rows: SnapshotRow[];
}

const KEY = "storeops.snapshots.v1";
const MAX_PER_SCOPE = 10;

function readAll(): PriceSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(snapshots: PriceSnapshot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshots));
  } catch {
    // Quota exceeded — drop oldest half and retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshots.slice(0, Math.ceil(snapshots.length / 2))));
    } catch {
      // give up silently; snapshots are best-effort
    }
  }
}

export function listSnapshots(appId: string, scope: string): PriceSnapshot[] {
  return readAll().filter((s) => s.appId === appId && s.scope === scope);
}

export function takeSnapshot(
  input: Omit<PriceSnapshot, "id" | "createdAt">
): PriceSnapshot {
  const snapshot: PriceSnapshot = {
    ...input,
    id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  const sameScope = all.filter(
    (s) => s.appId === input.appId && s.scope === input.scope
  );
  const others = all.filter(
    (s) => !(s.appId === input.appId && s.scope === input.scope)
  );
  // newest first, cap per scope
  const kept = [snapshot, ...sameScope].slice(0, MAX_PER_SCOPE);
  writeAll([...kept, ...others]);
  return snapshot;
}

export function deleteSnapshot(id: string) {
  writeAll(readAll().filter((s) => s.id !== id));
}

export function formatSnapshotDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function exportSnapshot(snapshot: PriceSnapshot) {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = snapshot.label.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.download = `snapshot-${slug}-${snapshot.createdAt.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
