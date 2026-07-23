"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PaywallModal } from "@/components/Paywall";
import type { GpCredentials } from "@/lib/gp/auth";
import { gpFetch } from "@/lib/gp/client";
import {
  changedListingFields,
  findListingMismatches,
  GP_LISTING_FIELDS,
  listingValue,
  validateListingFields,
  type GpListingDraft,
  type GpListingField,
} from "@/lib/gp/listings";
import type { GpEdit, GpListing, GpListingsResponse } from "@/lib/gp/types";
import { GooglePlayReleaseNotesEditor } from "@/components/GooglePlayReleaseNotesEditor";

const API = "/androidpublisher/v3/applications";

function editPath(packageName: string, editId?: string): string {
  const base = `${API}/${encodeURIComponent(packageName)}/edits`;
  return editId ? `${base}/${encodeURIComponent(editId)}` : base;
}

export function GooglePlayMetadataEditor({
  credentials,
  packageName,
  isPro,
}: {
  credentials: GpCredentials;
  packageName: string;
  isPro: boolean;
}) {
  const [listings, setListings] = useState<GpListing[] | null>(null);
  const [draft, setDraft] = useState<GpListingDraft>({});
  const [activeField, setActiveField] = useState<GpListingField>("title");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paywallOpen, setPaywallOpen] = useState(false);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    let temporaryEditId: string | null = null;
    try {
      const edit = await gpFetch<GpEdit>(credentials, editPath(packageName), {
        method: "POST",
      });
      temporaryEditId = edit.id;
      const result = await gpFetch<GpListingsResponse>(
        credentials,
        `${editPath(packageName, edit.id)}/listings`,
      );
      setListings(
        (result.listings ?? []).slice().sort((a, b) => a.language.localeCompare(b.language)),
      );
      setDraft({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setListings(null);
    } finally {
      // Free preview edits contain no changes and expire automatically. Only
      // entitled users may call the generic delete endpoint because another
      // edit ID could hold an unrelated Play Console draft.
      if (temporaryEditId && isPro) {
        await gpFetch(credentials, editPath(packageName, temporaryEditId), {
          method: "DELETE",
        }).catch(() => undefined);
      }
      setLoading(false);
    }
  }, [credentials, isPro, packageName]);

  useEffect(() => {
    queueMicrotask(() => void loadListings());
  }, [loadListings]);

  const updates = useMemo(() => {
    return (listings ?? []).flatMap((listing) => {
      const changed = changedListingFields(listing, draft[listing.language] ?? {});
      return Object.keys(changed).length > 0 ? [{ listing, changed }] : [];
    });
  }, [draft, listings]);

  const dirtyFieldCount = updates.reduce(
    (total, update) => total + Object.keys(update.changed).length,
    0,
  );
  const validationErrors = updates.flatMap(({ listing, changed }) =>
    validateListingFields(changed).map((message) => `${listing.language}: ${message}`),
  );
  const fieldDefinition = GP_LISTING_FIELDS.find((field) => field.key === activeField)!;

  function setCell(language: string, value: string) {
    setDraft((current) => ({
      ...current,
      [language]: { ...current[language], [activeField]: value },
    }));
    setSuccess("");
  }

  function getCell(listing: GpListing): string {
    return draft[listing.language]?.[activeField] ?? listingValue(listing, activeField);
  }

  function applyToAll(source: GpListing) {
    const value = getCell(source);
    setDraft((current) => {
      const next = { ...current };
      for (const listing of listings ?? []) {
        next[listing.language] = { ...next[listing.language], [activeField]: value };
      }
      return next;
    });
    setSuccess("");
  }

  async function applyChanges() {
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    if (updates.length === 0 || validationErrors.length > 0) return;

    setSaving(true);
    setError("");
    setSuccess("");
    let editId: string | null = null;
    try {
      setProgress("Creating a fresh Google Play edit…");
      const edit = await gpFetch<GpEdit>(credentials, editPath(packageName), {
        method: "POST",
      });
      editId = edit.id;

      setProgress("Checking the latest listing values…");
      const freshResponse = await gpFetch<GpListingsResponse>(
        credentials,
        `${editPath(packageName, edit.id)}/listings`,
      );
      const freshByLanguage = new Map(
        (freshResponse.listings ?? []).map((listing) => [listing.language, listing]),
      );
      const expected: GpListing[] = [];

      for (const [index, update] of updates.entries()) {
        const fresh = freshByLanguage.get(update.listing.language);
        if (!fresh) {
          throw new Error(`${update.listing.language} disappeared from Google Play. Refresh and try again.`);
        }
        const freshChanges = changedListingFields(fresh, draft[fresh.language] ?? {});
        if (Object.keys(freshChanges).length === 0) continue;
        const merged: GpListing = { ...fresh, ...freshChanges };
        setProgress(`Updating ${fresh.language} (${index + 1}/${updates.length})…`);
        await gpFetch(
          credentials,
          `${editPath(packageName, edit.id)}/listings/${encodeURIComponent(fresh.language)}`,
          { method: "PUT", body: merged },
        );
        expected.push(merged);
      }

      setProgress("Validating the complete Google Play edit…");
      await gpFetch(credentials, `${editPath(packageName, edit.id)}:validate`, {
        method: "POST",
      });

      setProgress("Committing without disturbing an existing review…");
      await gpFetch(credentials, `${editPath(packageName, edit.id)}:commit`, {
        method: "POST",
        params: { changesInReviewBehavior: "ERROR_IF_IN_REVIEW" },
      });
      editId = null;

      setProgress("Reading Google Play again to verify every field…");
      const verificationEdit = await gpFetch<GpEdit>(credentials, editPath(packageName), {
        method: "POST",
      });
      let verifiedResponse: GpListingsResponse;
      try {
        verifiedResponse = await gpFetch<GpListingsResponse>(
          credentials,
          `${editPath(packageName, verificationEdit.id)}/listings`,
        );
      } finally {
        await gpFetch(credentials, editPath(packageName, verificationEdit.id), {
          method: "DELETE",
        }).catch(() => undefined);
      }

      const verified = (verifiedResponse.listings ?? []).slice().sort(
        (a, b) => a.language.localeCompare(b.language),
      );
      const mismatches = findListingMismatches(expected, verified);
      if (mismatches.length > 0) {
        throw new Error(`Google accepted the commit, but verification failed: ${mismatches.join("; ")}`);
      }
      setListings(verified);
      setDraft({});
      setSuccess(
        `Verified ${expected.length} locale${expected.length === 1 ? "" : "s"} against Google Play after commit.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      if (editId) {
        await gpFetch(credentials, editPath(packageName, editId), {
          method: "DELETE",
        }).catch(() => undefined);
      }
    } finally {
      setProgress("");
      setSaving(false);
    }
  }

  return (
    <>
    <section className="card card-hero p-5 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="font-semibold">Store listing metadata</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Edit localized titles, descriptions, and promo videos. StoreOps validates the
            full edit, commits safely, then reads Google Play again to verify it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadListings()}
            disabled={loading || saving}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
          >
            Refresh
          </button>
          <button
            onClick={() => void applyChanges()}
            disabled={loading || saving || dirtyFieldCount === 0 || validationErrors.length > 0}
            className="btn-glow rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {saving
              ? "Applying…"
              : dirtyFieldCount > 0
                ? `${isPro ? "" : "🔒 "}Apply ${dirtyFieldCount} metadata change${dirtyFieldCount === 1 ? "" : "s"}`
                : "No metadata changes"}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
        A commit may send these listing changes to Google review. If this app already has
        changes in review, StoreOps stops instead of canceling that review.
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-3 rounded-md border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          ✓ {success}
        </p>
      )}
      {(loading || saving) && (
        <p className="mb-3 text-sm text-zinc-400 animate-pulse">
          {progress || "Loading localized listings from Google Play…"}
        </p>
      )}
      {validationErrors.length > 0 && (
        <div className="mb-3 space-y-1 text-xs text-red-400">
          {validationErrors.map((message) => <p key={message}>⚠ {message}</p>)}
        </div>
      )}

      {listings && listings.length === 0 && !loading && (
        <p className="text-sm text-zinc-400">
          No localized main store listings were returned for this package.
        </p>
      )}

      {listings && listings.length > 0 && (
        <>
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-zinc-800">
            {GP_LISTING_FIELDS.map((field) => (
              <button
                key={field.key}
                onClick={() => setActiveField(field.key)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                  activeField === field.key
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {field.label}
              </button>
            ))}
          </div>

          <div className="max-h-[36rem] space-y-2 overflow-y-auto pr-1">
            {listings.map((listing) => {
              const value = getCell(listing);
              const changed = value !== listingValue(listing, activeField);
              const overLimit = fieldDefinition.limit !== null && value.length > fieldDefinition.limit;
              return (
                <div
                  key={listing.language}
                  className={`rounded-lg border p-3 ${
                    changed
                      ? "border-emerald-700 bg-emerald-950/20"
                      : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-zinc-400">
                      {listing.language}{changed && <span className="ml-1 text-emerald-400">●</span>}
                    </span>
                    <div className="flex items-center gap-3">
                      {fieldDefinition.limit !== null && (
                        <span className={`text-xs ${overLimit ? "font-semibold text-red-400" : "text-zinc-500"}`}>
                          {value.length}/{fieldDefinition.limit}
                        </span>
                      )}
                      <button
                        onClick={() => applyToAll(listing)}
                        className="text-xs text-zinc-400 hover:text-emerald-400"
                        title={`Copy this ${fieldDefinition.label} to every locale`}
                      >
                        Apply to all →
                      </button>
                    </div>
                  </div>
                  {fieldDefinition.rows > 1 ? (
                    <textarea
                      value={value}
                      onChange={(event) => setCell(listing.language, event.target.value)}
                      rows={fieldDefinition.rows}
                      className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <input
                      value={value}
                      onChange={(event) => setCell(listing.language, event.target.value)}
                      placeholder={activeField === "video" ? "https://www.youtube.com/watch?v=…" : undefined}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </section>
    <GooglePlayReleaseNotesEditor
      packageName={packageName}
      listingLanguages={(listings ?? []).map((listing) => listing.language)}
    />
    </>
  );
}
