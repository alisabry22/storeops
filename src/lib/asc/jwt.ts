/**
 * App Store Connect JWT generation — runs ENTIRELY in the browser.
 * The .p8 private key never leaves the user's machine; only the signed,
 * short-lived (20 min) token is sent to our proxy.
 */
import { SignJWT, importPKCS8 } from "jose";

export interface AscCredentials {
  issuerId: string;
  keyId: string;
  privateKeyPem: string; // contents of the .p8 file
}

const TOKEN_LIFETIME_SECONDS = 19 * 60; // Apple max is 20 min; stay under

let cachedToken: { token: string; expiresAt: number; keyId: string } | null =
  null;

export async function getToken(creds: AscCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.keyId === creds.keyId &&
    cachedToken.expiresAt - now > 60
  ) {
    return cachedToken.token;
  }

  const pem = normalizePem(creds.privateKeyPem);
  const privateKey = await importPKCS8(pem, "ES256");

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: creds.keyId, typ: "JWT" })
    .setIssuer(creds.issuerId)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_LIFETIME_SECONDS)
    .setAudience("appstoreconnect-v1")
    .sign(privateKey);

  cachedToken = {
    token,
    expiresAt: now + TOKEN_LIFETIME_SECONDS,
    keyId: creds.keyId,
  };
  return token;
}

export function clearTokenCache() {
  cachedToken = null;
}

/** Accepts raw base64 body or full PEM; returns a valid PEM string. */
function normalizePem(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("-----BEGIN")) return trimmed;
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}
