import { createHash } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getUserId } from "@/lib/server/auth";

const ISSUER = "storeops";
const AUDIENCE = "storeops-store-write";
const PROOF_TTL_SECONDS = 24 * 60 * 60;

function getProofSecret(): Uint8Array | null {
  const value =
    process.env.STOREOPS_LICENSE_PROOF_SECRET ??
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  return value ? new TextEncoder().encode(value) : null;
}

export function hashLicenseKey(licenseKey: string): string {
  return createHash("sha256").update(licenseKey).digest("hex");
}

export async function issueLegacyWriteProof(input: {
  licenseKey: string;
  instanceId?: string;
  productId?: string | number;
  variantId?: string | number;
}): Promise<{ token: string; expiresAt: string } | null> {
  const secret = getProofSecret();
  if (!secret) return null;
  const expiresAt = new Date(Date.now() + PROOF_TTL_SECONDS * 1000);
  const token = await new SignJWT({
    source: "legacy-license",
    instanceId: input.instanceId ?? null,
    productId: input.productId ? String(input.productId) : null,
    variantId: input.variantId ? String(input.variantId) : null,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(hashLicenseKey(input.licenseKey))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt: expiresAt.toISOString() };
}

async function hasPaidAccount(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId || !process.env.DATABASE_URL) return false;
  try {
    const [user] = await getDb()
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return user?.plan === "pro" || user?.plan === "lifetime";
  } catch {
    return false;
  }
}

async function hasValidLegacyProof(req: Request): Promise<boolean> {
  const secret = getProofSecret();
  const token = req.headers.get("x-storeops-license-proof");
  if (!secret || !token) return false;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload.source === "legacy-license" && typeof payload.sub === "string";
  } catch {
    return false;
  }
}

/** Server-side entitlement gate for every store mutation. */
export async function canWriteToStores(req: Request): Promise<boolean> {
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.STOREOPS_ALLOW_UNLICENSED_WRITES === "true"
  ) {
    return true;
  }
  return (await hasPaidAccount()) || (await hasValidLegacyProof(req));
}
