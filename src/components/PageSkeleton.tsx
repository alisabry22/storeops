/**
 * Shown while the browser state, account, or signing key is still loading, so
 * pages never flash an empty black screen that looks broken.
 */
export function PageSkeleton({ label = "Loading StoreOps…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-5xl px-6 py-10">
      <span className="sr-only">{label}</span>
      <div className="mb-10 flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded-md bg-zinc-800/80" />
        <div className="h-8 w-48 animate-pulse rounded-full bg-zinc-900" />
      </div>
      <div className="mb-3 h-8 w-64 animate-pulse rounded-md bg-zinc-800/80" />
      <div className="mb-8 h-4 w-96 max-w-full animate-pulse rounded bg-zinc-900" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card h-56 animate-pulse" />
        <div className="card h-56 animate-pulse" />
      </div>
    </div>
  );
}
