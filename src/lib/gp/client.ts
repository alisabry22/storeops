/**
 * Google Play Developer API client.
 * Calls go through /api/gp (CORS proxy) with a browser-minted OAuth token.
 * The proxy only ever sees the short-lived token — never the key.
 */
import { getGpToken, type GpCredentials } from "./auth";

const PROXY_BASE = "/api/gp";

export class GpError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(humanizeGpError(status, detail));
  }
}

function humanizeGpError(status: number, detail: string): string {
  if (status === 401)
    return "Google rejected the token (401). Reconnect with your service-account JSON — the key may have been deleted in Google Cloud Console.";
  if (status === 403)
    return `Permission denied (403): ${detail} — Two common causes: (1) the service account email hasn't been invited in Play Console → Users and permissions, or (2) the "Google Play Android Developer API" isn't enabled in the Cloud project.`;
  if (status === 404)
    return "Not found (404). Check the package name — the app must exist in Play Console and be accessible to this service account.";
  if (status === 429)
    return "Google rate limit hit (429). Wait a minute and retry.";
  if (status >= 500)
    return `Google's server errored (${status}). This is on Google's side — wait a minute and retry.`;
  return detail || `Google returned status ${status}.`;
}

export async function gpFetch<T = unknown>(
  creds: GpCredentials,
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

  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; ; attempt++) {
    const token = await getGpToken(creds);
    const res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const retryable =
      res.status === 429 ||
      (res.status >= 500 && (options.method ?? "GET") === "GET");
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const json = await res.json();
        detail = json.error?.message ?? detail;
      } catch {
        // non-JSON error body
      }
      throw new GpError(res.status, detail);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
