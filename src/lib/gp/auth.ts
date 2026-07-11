/**
 * Google Play OAuth — runs ENTIRELY in the browser, same trust model as
 * the Apple side. The service-account private key is imported ONCE as a
 * non-extractable WebCrypto key (IndexedDB); after that the key material
 * cannot be read back by anyone — including us. Only a signed, short-lived
 * assertion is sent to Google's token endpoint (via our CORS proxy, which
 * never sees the key).
 */
"use client";

import { SignJWT, importPKCS8 } from "jose";
import { deleteKey, loadKey, saveKey } from "../asc/keystore";

export interface GpCredentials {
  clientEmail: string;
}

const GP_KEY_ID = "gp-signing-key";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ASSERTION_LIFETIME_SECONDS = 3600; // Google max

let cachedToken: { token: string; expiresAt: number; email: string } | null =
  null;
let cachedKey: CryptoKey | null = null;

/**
 * Import a service-account JSON and persist its key as non-extractable.
 * Returns only the client email — the key itself is never readable again.
 */
export async function storeServiceAccount(
  json: string
): Promise<GpCredentials> {
  let parsed: { client_email?: string; private_key?: string; type?: string };
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      "That doesn't look like a service-account key. Create one in Google Cloud Console → IAM → Service Accounts → Keys → JSON."
    );
  }
  const key = await importPKCS8(parsed.private_key, "RS256");
  await saveKey(key, GP_KEY_ID);
  clearGpTokenCache();
  return { clientEmail: parsed.client_email };
}

export async function destroyGpKey(): Promise<void> {
  await deleteKey(GP_KEY_ID);
  clearGpTokenCache();
}

export function clearGpTokenCache() {
  cachedToken = null;
  cachedKey = null;
}

export async function getGpToken(creds: GpCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.email === creds.clientEmail &&
    cachedToken.expiresAt - now > 120
  ) {
    return cachedToken.token;
  }

  if (!cachedKey) {
    cachedKey = await loadKey(GP_KEY_ID);
  }
  if (!cachedKey) {
    throw new Error(
      "No Google signing key on this device — reconnect with your service-account JSON."
    );
  }

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(creds.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + ASSERTION_LIFETIME_SECONDS)
    .sign(cachedKey);

  const res = await fetch("/api/gp-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assertion }),
  });
  const json: {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  } = await res.json().catch(() => ({}));

  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ??
        json.error ??
        "Google rejected the token request — reconnect your service account."
    );
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
    email: creds.clientEmail,
  };
  return cachedToken.token;
}
