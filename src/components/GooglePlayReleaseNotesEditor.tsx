"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatPlayConsoleReleaseNotes,
  GP_RELEASE_NOTE_LIMIT,
  releaseNoteErrors,
} from "@/lib/gp/release-notes";

function storageKey(packageName: string): string {
  return `storeops-gp-release-notes:${packageName}`;
}

export function GooglePlayReleaseNotesEditor({
  packageName,
  listingLanguages,
}: {
  packageName: string;
  listingLanguages: string[];
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeLanguage, setActiveLanguage] = useState("");
  const [newLanguage, setNewLanguage] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  useEffect(() => {
    queueMicrotask(() => {
      let saved: Record<string, string> = {};
      try {
        saved = JSON.parse(localStorage.getItem(storageKey(packageName)) ?? "{}") as Record<string, string>;
      } catch {
        saved = {};
      }
      const merged = { ...Object.fromEntries(listingLanguages.map((language) => [language, ""])), ...saved };
      setNotes(merged);
      setActiveLanguage((current) =>
        current && Object.hasOwn(merged, current)
          ? current
          : Object.keys(merged).sort()[0] ?? "en-US",
      );
      setCopied(false);
      setCopyError("");
    });
  }, [listingLanguages, packageName]);

  const languages = useMemo(() => Object.keys(notes).sort(), [notes]);
  const formatted = useMemo(() => formatPlayConsoleReleaseNotes(notes), [notes]);
  const errors = useMemo(() => releaseNoteErrors(notes), [notes]);
  const completed = Object.values(notes).filter((note) => note.trim()).length;
  const value = notes[activeLanguage] ?? "";

  function updateNotes(next: Record<string, string>) {
    setNotes(next);
    localStorage.setItem(storageKey(packageName), JSON.stringify(next));
    setCopied(false);
    setCopyError("");
  }

  function addLanguage() {
    const language = newLanguage.trim();
    if (!language || Object.hasOwn(notes, language)) return;
    updateNotes({ ...notes, [language]: "" });
    setActiveLanguage(language);
    setNewLanguage("");
  }

  async function copyForPlayConsole() {
    if (!formatted || errors.length > 0) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Clipboard access was blocked. Allow clipboard access and try again.");
    }
  }

  return (
    <section className="card card-hero p-5 mb-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">What&apos;s new in this release?</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
            Write every translation here, then copy one Play Console-ready block. Drafts
            stay in this browser and are never sent to StoreOps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void copyForPlayConsole()}
            disabled={!formatted || errors.length > 0}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-40"
          >
            {copied ? "✓ Copied for Play Console" : `Copy ${completed} translation${completed === 1 ? "" : "s"}`}
          </button>
          <a
            href="https://play.google.com/console"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-emerald-600 hover:text-emerald-400"
          >
            Open Play Console ↗
          </a>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-sky-900/70 bg-sky-950/30 px-3 py-2 text-xs leading-relaxed text-sky-300/90">
        Fast handoff: choose the target track and release in Play Console, paste the copied
        block into “What&apos;s new in this release?”, review, and publish from Google.
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={activeLanguage}
          onChange={(event) => setActiveLanguage(event.target.value)}
          className="min-w-44 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {languages.map((language) => (
            <option key={language} value={language}>
              {language}{notes[language]?.trim() ? " ✓" : ""}
            </option>
          ))}
        </select>
        <input
          value={newLanguage}
          onChange={(event) => setNewLanguage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addLanguage();
          }}
          placeholder="Add locale, e.g. ar-EG"
          className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-mono focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={addLanguage}
          disabled={!newLanguage.trim() || Object.hasOwn(notes, newLanguage.trim())}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
        >
          Add locale
        </button>
        {languages.length > 1 && activeLanguage && (
          <button
            onClick={() => {
              const next = { ...notes };
              for (const language of languages) next[language] = value;
              updateNotes(next);
            }}
            className="ml-auto text-xs text-zinc-400 hover:text-emerald-400"
          >
            Apply this note to all →
          </button>
        )}
      </div>

      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-400">{activeLanguage}</span>
        <span className={`text-xs ${value.length > GP_RELEASE_NOTE_LIMIT ? "font-semibold text-red-400" : "text-zinc-500"}`}>
          {value.length}/{GP_RELEASE_NOTE_LIMIT}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(event) => updateNotes({ ...notes, [activeLanguage]: event.target.value })}
        rows={5}
        placeholder="Tell users what improved in this release…"
        className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />

      {errors.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-red-400">
          {errors.map((error) => <p key={error}>⚠ {error}</p>)}
        </div>
      )}
      {copyError && <p className="mt-2 text-xs text-red-400">⚠ {copyError}</p>}
    </section>
  );
}
