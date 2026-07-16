interface UpdateStatusProps {
  title: string;
  detail: string;
}

/** Visible confirmation that a bulk update request is still in flight. */
export function UpdateStatus({ title, detail }: UpdateStatusProps) {
  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-md border border-emerald-800/70 bg-emerald-950/30 px-3 py-2.5"
      role="status"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300"
      />
      <div className="text-sm">
        <p className="font-medium text-emerald-300">{title}</p>
        <p className="text-xs text-zinc-400">{detail}</p>
      </div>
    </div>
  );
}
