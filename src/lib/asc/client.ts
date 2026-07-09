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
  public hint: string;
  constructor(
    public status: number,
    public detail: string,
    public errors: Array<{ code: string; title: string; detail: string }> = []
  ) {
    super(humanizeAscError(status, errors, detail));
    this.hint = this.message;
  }
}

/**
 * Translate Apple's terse JSON:API errors into something an indie dev can act on.
 * Falls back to the raw detail if we don't have a specific hint.
 */
function humanizeAscError(
  status: number,
  errors: Array<{ code: string; title: string; detail: string }>,
  detail: string
): string {
  const first = errors[0];
  const code = first?.code;
  const raw = first?.detail ?? detail;

  if (status === 401)
    return "Your key was rejected (401). Re-check the Issuer ID, Key ID, and that the .p8 file matches the key shown in App Store Connect → Users and Access → Keys.";
  if (status === 403)
    return "This key can't do that (403). The key's role in App Store Connect lacks the required permission — App Manager or Admin is needed for pricing/metadata writes.";
  if (status === 404)
    return "Apple couldn't find that resource (404). It may have been deleted, or the version/subscription may not be in an editable state.";
  if (status === 409 && code === "ENTITY_ERROR.ATTRIBUTE.UNKNOWN")
    return `Apple rejected an attribute as unknown (409): ${raw}. Refresh the page and try again — if it persists, this version of StoreOps may be sending a field Apple changed.`;
  if (status === 409)
    return `Apple rejected this as a conflict (409): ${raw}. For subscriptions this usually means a price already exists for that territory — refresh and the tool will schedule it instead.`;
  if (status === 422)
    return `Apple rejected the data (422): ${raw}. Check the values in your sheet against Apple's allowed price tiers.`;
  if (status >= 500)
    return `Apple's server errored (${status}). This is on Apple's side — wait a minute and retry. If it persists, Apple's ASC API is having an outage.`;
  return raw || `Apple returned status ${status}.`;
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
  const url = new URL(PROXY_BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(options.params ?? {})) {
    url.searchParams.set(k, v);
  }

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; ; attempt++) {
    const token = await getToken(creds);
    await queue.acquire();
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } finally {
      // Release before any backoff sleep — holding a slot while sleeping
      // deadlocks the queue when every active request is retrying.
      queue.release();
    }

    // 429: not processed, safe to retry anything. 5xx: retry GETs only
    // (a retried POST could double-apply a write).
    const retryable =
      res.status === 429 ||
      (res.status >= 500 && (options.method ?? "GET") === "GET");
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const backoff = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
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
  }
}

/** Fetch all pages of a paginated ASC collection. */
export async function ascFetchAll<T>(
  creds: AscCredentials,
  path: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const { data } = await ascFetchAllFull<T>(creds, path, params);
  return data;
}

/**
 * Fetch all pages of a paginated ASC collection, preserving `included`
 * side-loaded resources (pricing endpoints depend on them).
 */
export async function ascFetchAllFull<T, I = unknown>(
  creds: AscCredentials,
  path: string,
  params: Record<string, string> = {}
): Promise<{ data: T[]; included: I[] }> {
  const data: T[] = [];
  const included: I[] = [];
  let next: string | null = path;
  let nextParams: Record<string, string> | undefined = {
    limit: "200",
    ...params, // callers may override limit (price-point endpoints allow 8000)
  };

  while (next) {
    const page: { data: T[]; included?: I[]; links?: { next?: string } } =
      await ascFetch(creds, next, { params: nextParams });
    data.push(...page.data);
    if (page.included) included.push(...page.included);
    if (page.links?.next) {
      // links.next is a full Apple URL; convert to proxy path + params
      const u = new URL(page.links.next);
      next = u.pathname;
      nextParams = Object.fromEntries(u.searchParams.entries());
    } else {
      next = null;
    }
  }
  return { data, included };
}
