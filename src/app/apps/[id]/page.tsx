"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCredentials } from "@/lib/store";
import { ascFetch, ascFetchAll } from "@/lib/asc/client";
import { AppTabs } from "@/components/AppTabs";
import {
  VERSION_FIELDS,
  type AppStoreVersion,
  type VersionLocalization,
  type VersionFieldKey,
} from "@/lib/asc/types";

type Draft = Record<string, Partial<Record<VersionFieldKey, string>>>;

const EDITABLE_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

export default function MetadataEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { credentials } = useCredentials();

  const [versions, setVersions] = useState<AppStoreVersion[] | null>(null);
  const [selectedVersion, setSelectedVersion] =
    useState<AppStoreVersion | null>(null);
  const [locs, setLocs] = useState<VersionLocalization[] | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [activeField, setActiveField] = useState<VersionFieldKey>("whatsNew");
  const [saving, setSaving] = useState(false);
  const [saveLog, setSaveLog] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated) return;
    if (!credentials) {
      router.replace("/");
      return;
    }
    ascFetchAll<AppStoreVersion>(credentials, `/v1/apps/${id}/appStoreVersions`)
      .then((vs) => {
        setVersions(vs);
        // Prefer an editable version, else the latest
        const editable = vs.find((v) =>
          EDITABLE_STATES.has(v.attributes.appStoreState)
        );
        setSelectedVersion(editable ?? vs[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [hydrated, credentials, id, router]);

  useEffect(() => {
    if (!credentials || !selectedVersion) return;
    setLocs(null);
    setDraft({});
    ascFetchAll<VersionLocalization>(
      credentials,
      `/v1/appStoreVersions/${selectedVersion.id}/appStoreVersionLocalizations`
    )
      .then((ls) =>
        setLocs(ls.sort((a, b) => a.attributes.locale.localeCompare(b.attributes.locale)))
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [credentials, selectedVersion]);

  const versionEditable = selectedVersion
    ? EDITABLE_STATES.has(selectedVersion.attributes.appStoreState)
    : false;

  const dirtyCount = useMemo(
    () =>
      Object.values(draft).reduce(
        (n, fields) => n + Object.keys(fields).length,
        0
      ),
    [draft]
  );

  const setCell = useCallback(
    (locId: string, field: VersionFieldKey, value: string) => {
      setDraft((d) => ({ ...d, [locId]: { ...d[locId], [field]: value } }));
    },
    []
  );

  function applyToAll(sourceLocId: string) {
    const value = getCellValue(sourceLocId, activeField);
    setDraft((d) => {
      const next = { ...d };
      for (const loc of locs ?? []) {
        if (loc.id === sourceLocId) continue;
        next[loc.id] = { ...next[loc.id], [activeField]: value };
      }
      return next;
    });
  }

  function getCellValue(locId: string, field: VersionFieldKey): string {
    const drafted = draft[locId]?.[field];
    if (drafted !== undefined) return drafted;
    const loc = locs?.find((l) => l.id === locId);
    return (loc?.attributes[field] as string | null) ?? "";
  }

  function isDirty(locId: string, field: VersionFieldKey): boolean {
    const drafted = draft[locId]?.[field];
    if (drafted === undefined) return false;
    const loc = locs?.find((l) => l.id === locId);
    return drafted !== ((loc?.attributes[field] as string | null) ?? "");
  }

  async function saveAll() {
    if (!credentials || !locs) return;
    setSaving(true);
    setSaveLog([]);
    const log: string[] = [];

    for (const loc of locs) {
      const fields = draft[loc.id];
      if (!fields) continue;
      const changed: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v !== ((loc.attributes[k as VersionFieldKey] as string | null) ?? ""))
          changed[k] = v;
      }
      if (Object.keys(changed).length === 0) continue;

      try {
        await ascFetch(credentials, `/v1/appStoreVersionLocalizations/${loc.id}`, {
          method: "PATCH",
          body: {
            data: {
              type: "appStoreVersionLocalizations",
              id: loc.id,
              attributes: changed,
            },
          },
        });
        log.push(`✓ ${loc.attributes.locale}`);
      } catch (e) {
        log.push(
          `✗ ${loc.attributes.locale}: ${e instanceof Error ? e.message : e}`
        );
      }
      setSaveLog([...log]);
    }

    const savedCount = log.filter((l) => l.startsWith("✓")).length;
    if (savedCount > 1) {
      // ~1.5 min per locale of ASC navigation, load times, and clicking
      log.push(
        `🎉 ${savedCount} locales updated — that's ~${Math.round(savedCount * 1.5)} min of ASC clicking you just skipped.`
      );
      setSaveLog([...log]);
    }

    // Refresh from Apple so the table reflects reality
    const fresh = await ascFetchAll<VersionLocalization>(
      credentials,
      `/v1/appStoreVersions/${selectedVersion!.id}/appStoreVersionLocalizations`
    );
    setLocs(
      fresh.sort((a, b) => a.attributes.locale.localeCompare(b.attributes.locale))
    );
    setDraft({});
    setSaving(false);
  }

  const fieldDef = VERSION_FIELDS.find((f) => f.key === activeField)!;

  if (!hydrated || !credentials) return null;

  return (
    <main className="max-w-5xl mx-auto w-full px-6 py-10">
      <div className="flex items-center gap-3 mb-6 text-sm text-zinc-400">
        <Link href="/apps" className="hover:text-zinc-200">
          ← Apps
        </Link>
      </div>

      <AppTabs appId={id} active="metadata" />

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {!versions && !error && (
        <p className="text-zinc-400 animate-pulse">Loading versions…</p>
      )}

      {versions && versions.length === 0 && (
        <p className="text-zinc-400">No App Store versions found.</p>
      )}

      {selectedVersion && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div>
              <h1 className="text-xl font-bold">Metadata editor</h1>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={selectedVersion.id}
                  onChange={(e) =>
                    setSelectedVersion(
                      versions!.find((v) => v.id === e.target.value) ?? null
                    )
                  }
                  className="rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1 text-sm"
                >
                  {versions!.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.attributes.versionString} —{" "}
                      {v.attributes.appStoreState.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
                {!versionEditable && (
                  <span className="text-xs text-amber-400 bg-amber-950/50 border border-amber-900 rounded px-2 py-0.5">
                    read-only: create a new version in ASC to edit
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={saveAll}
              disabled={!versionEditable || dirtyCount === 0 || saving}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {saving
                ? "Saving…"
                : dirtyCount > 0
                  ? `Save ${dirtyCount} change${dirtyCount > 1 ? "s" : ""}`
                  : "No changes"}
            </button>
          </div>

          {/* Field tabs */}
          <div className="flex gap-1 mb-4 border-b border-zinc-800">
            {VERSION_FIELDS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveField(f.key)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px transition ${
                  activeField === f.key
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {saveLog.length > 0 && (
            <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs font-mono space-y-0.5 max-h-32 overflow-y-auto">
              {saveLog.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("✓")
                      ? "text-emerald-400"
                      : line.startsWith("🎉")
                        ? "text-emerald-300 font-semibold"
                        : "text-red-400"
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          )}

          {!locs && <p className="text-zinc-400 animate-pulse">Loading locales…</p>}

          {locs && (
            <div className="space-y-2">
              {locs.map((loc) => {
                const value = getCellValue(loc.id, activeField);
                const dirty = isDirty(loc.id, activeField);
                const over = value.length > fieldDef.maxLen;
                return (
                  <div
                    key={loc.id}
                    className={`rounded-lg border p-3 ${
                      dirty
                        ? "border-emerald-700 bg-emerald-950/20"
                        : "border-zinc-800 bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono text-zinc-400">
                        {loc.attributes.locale}
                        {dirty && <span className="text-emerald-400 ml-1">●</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs ${over ? "text-red-400 font-semibold" : "text-zinc-500"}`}
                        >
                          {value.length}/{fieldDef.maxLen}
                        </span>
                        <button
                          onClick={() => applyToAll(loc.id)}
                          disabled={!versionEditable}
                          className="text-xs text-zinc-400 hover:text-emerald-400 disabled:opacity-30"
                          title={`Copy this ${fieldDef.label} to all other locales`}
                        >
                          Apply to all →
                        </button>
                      </div>
                    </div>
                    {fieldDef.multiline ? (
                      <textarea
                        value={value}
                        readOnly={!versionEditable}
                        onChange={(e) => setCell(loc.id, activeField, e.target.value)}
                        rows={activeField === "description" ? 4 : 2}
                        className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none resize-y read-only:opacity-60"
                      />
                    ) : (
                      <input
                        value={value}
                        readOnly={!versionEditable}
                        onChange={(e) => setCell(loc.id, activeField, e.target.value)}
                        className="w-full rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none read-only:opacity-60"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}
