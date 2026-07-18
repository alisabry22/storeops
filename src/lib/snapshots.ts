/**
 * Pre-apply snapshots — the undo button for people's income.
 * Before every write to Apple we save the current state locally so one
 * click restores it. Stored in localStorage, capped per scope.
 */
"use client";

import { deleteSnapshotFromServer, pushSnapshotToServer } from "./snapshot-sync";

export interface SnapshotRow {
  territoryId: string;
  pricePointId: string;
  customerPrice: string;
  currency: string;
  manual?: boolean;
}

export interface PriceSnapshot {
  schemaVersion?: 1;
  id: string;
  createdAt: string; // ISO
  appId: string;
  /** "app-pricing" or `sub:${subscriptionId}` */
  scope: string;
  label: string;
  baseTerritory?: string;
  platform?: "appstore" | "googleplay";
  rows: SnapshotRow[];
}

const KEY = "storeops.snapshots.v1";
// A regional grid is compact enough to retain useful pricing history while
// still fitting comfortably in the browser fallback store. Signed-in users
// also receive best-effort server sync.
export const MAX_SNAPSHOTS_PER_SCOPE = 25;

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

function writeAll(snapshots: PriceSnapshot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshots));
  } catch {
    // Quota exceeded — drop oldest half and retry once
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshots.slice(0, Math.ceil(snapshots.length / 2))));
    } catch {
      throw new Error(
        "StoreOps could not save the safety snapshot in this browser. No store write was started. Free storage or enable browser storage, then try again."
      );
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
    schemaVersion: 1,
    platform: input.platform ?? (input.scope.startsWith("gp:") ? "googleplay" : "appstore"),
    id: `snap_${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
    }`,
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
  const kept = [snapshot, ...sameScope].slice(0, MAX_SNAPSHOTS_PER_SCOPE);
  writeAll([...kept, ...others]);
  void pushSnapshotToServer(snapshot);
  return snapshot;
}

/**
 * Revenue-affecting writes use this stricter path. The browser copy is saved
 * first; when StoreOps accounts are configured, the cloud copy must also be
 * confirmed before the store mutation may begin.
 */
export async function takeRequiredSnapshot(
  input: Omit<PriceSnapshot, "id" | "createdAt">
): Promise<PriceSnapshot> {
  const snapshot: PriceSnapshot = {
    ...input,
    schemaVersion: 1,
    platform:
      input.platform ??
      (input.scope.startsWith("gp:") ? "googleplay" : "appstore"),
    id: `snap_${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
    }`,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  const sameScope = all.filter(
    (item) => item.appId === input.appId && item.scope === input.scope
  );
  const others = all.filter(
    (item) => !(item.appId === input.appId && item.scope === input.scope)
  );
  writeAll([
    [snapshot, ...sameScope].slice(0, MAX_SNAPSHOTS_PER_SCOPE),
    others,
  ].flat());

  const result = await pushSnapshotToServer(snapshot);
  if (result.cloudExpected && result.status !== "synced") {
    throw new Error(
      `The safety snapshot was saved on this device, but StoreOps could not confirm its cloud copy. No store write was started. Retry when account sync is available. ${result.error ?? ""}`.trim()
    );
  }
  return snapshot;
}

export function deleteSnapshot(id: string) {
  writeAll(readAll().filter((s) => s.id !== id));
  deleteSnapshotFromServer(id);
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

/** Import an exported restore point into the currently selected workspace. */
export function importSnapshot(
  json: string,
  expected: { appId: string; scope: string }
): PriceSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("That file is not valid snapshot JSON.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("That file does not contain a StoreOps snapshot.");
  }
  const parsed = value as Partial<PriceSnapshot>;
  if (parsed.appId !== expected.appId || parsed.scope !== expected.scope) {
    throw new Error(
      "This snapshot belongs to a different app or pricing workspace. Select its original product before importing it."
    );
  }
  if (
    typeof parsed.label !== "string" ||
    parsed.label.length === 0 ||
    !Array.isArray(parsed.rows) ||
    parsed.rows.length === 0 ||
    parsed.rows.length > 1000
  ) {
    throw new Error("That snapshot is missing required pricing data.");
  }
  const validRows = parsed.rows.every(
    (row) =>
      row &&
      typeof row.territoryId === "string" &&
      typeof row.pricePointId === "string" &&
      typeof row.customerPrice === "string" &&
      typeof row.currency === "string"
  );
  if (!validRows) throw new Error("That snapshot contains invalid price rows.");

  return takeSnapshot({
    appId: expected.appId,
    scope: expected.scope,
    label: `Imported · ${parsed.label}`.slice(0, 120),
    baseTerritory: parsed.baseTerritory,
    platform: parsed.platform,
    rows: parsed.rows,
  });
}
