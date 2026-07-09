/**
 * App Store Connect JWT generation — runs ENTIRELY in the browser.
 * The .p8 is imported ONCE as a non-extractable WebCrypto key (IndexedDB);
 * after that the key material cannot be read back by anyone — including us.
 * Only the signed, short-lived (20 min) token is sent to our proxy.
 */
import { SignJWT, importPKCS8 } from "jose";
import { deleteKey, loadKey, saveKey } from "./keystore";

export interface AscCredentials {
  issuerId: string;
  keyId: string;
  /** Legacy only — pre-keystore credentials persisted the PEM. Migrated on first use. */
  privateKeyPem?: string;
}

const TOKEN_LIFETIME_SECONDS = 19 * 60; // Apple max is 20 min; stay under

let cachedToken: { token: string; expiresAt: number; keyId: string } | null =
  null;
let cachedKey: CryptoKey | null = null;

async function resolveSigningKey(
  creds: AscCredentials
): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  let key = await loadKey();
  if (!key && creds.privateKeyPem) {
    // Legacy migration: import the persisted PEM into the keystore once.
    // The caller (KeyMigrator) strips the PEM from localStorage after this.
    key = await importPrivateKey(creds.privateKeyPem);
    await saveKey(key);
  }
  if (!key) {
    throw new Error(
      "No signing key on this device — reconnect with your .p8 file."
    );
  }
  cachedKey = key;
  return key;
}

export async function getToken(creds: AscCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (
    cachedToken &&
    cachedToken.keyId === creds.keyId &&
    cachedToken.expiresAt - now > 60
  ) {
    return cachedToken.token;
  }

  const privateKey = await resolveSigningKey(creds);

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
  cachedKey = null;
}

/** Import a .p8 and persist it as a non-extractable key. Returns nothing readable. */
export async function storePrivateKey(pem: string): Promise<void> {
  const key = await importPrivateKey(pem);
  await saveKey(key);
  clearTokenCache();
}

/** Remove the signing key from this device. */
export async function destroyPrivateKey(): Promise<void> {
  await deleteKey();
  clearTokenCache();
}

/**
 * Import an EC P-256 private key from PEM (PKCS#8 or SEC1) or raw base64,
 * always as a NON-EXTRACTABLE CryptoKey (jose defaults extractable=false,
 * and the SEC1 path passes false explicitly).
 * Apple .p8 files are PKCS#8, but some tools/exports use SEC1 format.
 */
export async function importPrivateKey(input: string): Promise<CryptoKey> {
  const cleaned = input.replace(/^\xEF\xBB\xBF/, "").replace(/\r\n/g, "\n").trim();

  if (cleaned.startsWith("-----BEGIN EC PRIVATE KEY-----")) {
    return importSec1Key(cleaned);
  }

  // PKCS#8 PEM or raw base64 → normalize to PEM and use jose
  let pem = cleaned;
  if (!pem.startsWith("-----BEGIN")) {
    const body = pem.replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
    pem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
  }
  return importPKCS8(pem, "ES256");
}

/**
 * Import SEC1 EC key by converting to PKCS#8 DER and using WebCrypto directly.
 * SEC1 (RFC 5915) → PKCS#8 (RFC 5958) wrapping for P-256.
 */
async function importSec1Key(sec1Pem: string): Promise<CryptoKey> {
  const b64 = sec1Pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, "")
    .replace(/-----END EC PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const sec1Der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // PKCS#8 = SEQUENCE { version, algorithmIdentifier, OCTET STRING { sec1Der } }
  const algId = new Uint8Array([
    0x30, 0x13, // SEQUENCE
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID 1.2.840.10045.2.1 (ecPublicKey)
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID 1.2.840.10045.3.1.7 (P-256)
  ]);

  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0

  // Wrap SEC1 in OCTET STRING
  const octetString = wrapAsn1(0x04, sec1Der);

  // Wrap everything in outer SEQUENCE
  const inner = concatBytes(version, algId, octetString);
  const pkcs8Der = wrapAsn1(0x30, inner);

  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8Der.buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function wrapAsn1(tag: number, content: Uint8Array): Uint8Array {
  const len = content.length;
  let header: Uint8Array;
  if (len < 0x80) {
    header = new Uint8Array([tag, len]);
  } else if (len < 0x100) {
    header = new Uint8Array([tag, 0x81, len]);
  } else {
    header = new Uint8Array([tag, 0x82, (len >> 8) & 0xff, len & 0xff]);
  }
  return concatBytes(header, content);
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
