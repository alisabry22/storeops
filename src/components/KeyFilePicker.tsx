"use client";

import { useId, useState } from "react";
import { AppIcon } from "./AppIcon";

/**
 * Click-or-drop key file picker.
 *
 * Deliberately no `accept` filter for Apple keys: Chrome on macOS cannot map
 * `.p8` to a known file type and greys the file out in the picker, which made
 * the AuthKey_XXXX.p8 file impossible to choose. Content is validated after
 * selection instead.
 */
export function KeyFilePicker({
  label,
  hint,
  accept,
  fileName,
  loaded,
  disabled,
  onFile,
}: {
  label: string;
  hint: string;
  accept?: string;
  fileName?: string;
  loaded?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  const id = useId();
  const [dragging, setDragging] = useState(false);

  return (
    <div>
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !disabled) onFile(file);
        }}
        className={`mt-1.5 flex min-h-20 cursor-pointer items-center gap-4 rounded-lg border border-dashed px-4 py-4 transition-colors ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : dragging
              ? "border-emerald-400 bg-emerald-950/30"
              : loaded
                ? "border-emerald-700 bg-emerald-950/20 hover:border-emerald-500"
                : "border-zinc-700 bg-zinc-950/60 hover:border-zinc-500 hover:bg-zinc-900/60"
        }`}
      >
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${
            loaded ? "border-emerald-700 text-emerald-300" : "border-zinc-700 text-zinc-400"
          }`}
        >
          <AppIcon name={loaded ? "check" : "shield"} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm ${loaded ? "font-mono text-emerald-200" : "text-zinc-200"}`}>
            {loaded && fileName ? fileName : dragging ? "Drop to add the key" : "Choose a file or drop it here"}
          </span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            {loaded ? "Key ready · click to choose a different file" : hint}
          </span>
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
