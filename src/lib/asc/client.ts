/**
 * App Store Connect API client.
 * Calls go through our /api/asc proxy (Apple blocks CORS from browsers).
 * The proxy only ever sees the short-lived JWT — never the .p8 key.
 * Includes a request queue to respect Apple's rate limits.
 */
import { getToken, type AscCredentials } from "./jwt";

const PROXY_BASE = "/api/asc";

// Apple allows ~3500 req/hour but bursts get throttled; keep it gentle.
const MAX_CONCURRENT = 4;
const MIN_INTERVAL_MS = 150;

class RequestQueue {
  private active = 0;
  private lastStart = 0;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.active >= MAX_CONCURRENT) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    const wait = this.lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastStart = Date.now();
  }

  release() {
    this.active--;
    this.queue.shift()?.();
  }
}

const queue = new RequestQueue();

export class AscError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public errors: Array<{ code: string; title: string; detail: string }> = []
  ) {
    super(`ASC ${status}: ${detail}`);
  }
}

export async function ascFetch<T = unknown>(
  creds: AscCredentials,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
  } = {}
): Promise<T> {
  const token = await getToken(creds);
  const url = new URL(PROXY_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(options.params ?? {})) {
    url.searchParams.set(k, v);
  }

  await queue.acquire();
  try {
    const res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 429) {
      // Rate limited — back off and retry once
      await new Promise((r) => setTimeout(r, 5000));
      return ascFetch(creds, path, options);
    }

    if (!res.ok) {
      let errors: Array<{ code: string; title: string; detail: string }> = [];
      let detail = res.statusText;
      try {
        const json = await res.json();
        errors = json.errors ?? [];
        detail = errors[0]?.detail ?? errors[0]?.title ?? detail;
      } catch {
        // non-JSON error body
      }
      throw new AscError(res.status, detail, errors);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    queue.release();
  }
}

/** Fetch all pages of a paginated ASC collection. */
export async function ascFetchAll<T>(
  creds: AscCredentials,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = path;
  let nextParams: Record<string, string> | undefined = {
    ...params,
    limit: "200",
  };

  while (next) {
    const page: { data: T[]; links?: { next?: string } } = await ascFetch(
      creds,
      next,
      { params: nextParams }
    );
    results.push(...page.data);
    if (page.links?.next) {
      // links.next is a full Apple URL; convert to proxy path + params
      const u = new URL(page.links.next);
      next = u.pathname.replace(/^\/v\d+/, (m) => m); // keep /v1 prefix
      next = u.pathname;
      nextParams = Object.fromEntries(u.searchParams.entries());
    } else {
      next = null;
    }
  }
  return results;
}
