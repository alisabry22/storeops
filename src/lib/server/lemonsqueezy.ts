import crypto from "node:crypto";

export interface LemonPlanAttributes {
  first_order_item?: {
    product_name?: string;
    variant_id?: number;
  };
  product_name?: string;
  variant_id?: number;
}

export function verifyLemonSignature(
  raw: string,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expected = Buffer.from(hmac);
  const received = Buffer.from(signature);
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

export function verifyLemonSignatureWithRotation(
  raw: string,
  signature: string,
  currentSecret: string,
  previousSecret?: string
): boolean {
  return [currentSecret, previousSecret]
    .filter((secret): secret is string => !!secret)
    .some((secret) => verifyLemonSignature(raw, signature, secret));
}

function configuredIds(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function hasConfiguredLemonVariants(): boolean {
  return (
    configuredIds("LEMONSQUEEZY_LIFETIME_VARIANT_IDS").size > 0 ||
    configuredIds("LEMONSQUEEZY_PRO_VARIANT_IDS").size > 0
  );
}

export function identifyLemonPlan(
  attrs: LemonPlanAttributes | undefined
): "pro" | "lifetime" | null {
  if (!attrs) return null;
  const item = attrs.first_order_item;
  const variantId = String(attrs.variant_id ?? item?.variant_id ?? "");
  const lifetimeIds = configuredIds("LEMONSQUEEZY_LIFETIME_VARIANT_IDS");
  const proIds = configuredIds("LEMONSQUEEZY_PRO_VARIANT_IDS");
  if (lifetimeIds.has(variantId)) return "lifetime";
  if (proIds.has(variantId)) return "pro";
  if (lifetimeIds.size > 0 || proIds.size > 0) return null;

  // Compatibility fallback for old installs that predate variant allowlists.
  // Never turn an arbitrary Lemon Squeezy product into StoreOps access.
  const productName = (
    item?.product_name ??
    attrs.product_name ??
    ""
  ).toLowerCase();
  if (!productName.includes("storeops")) return null;
  return productName.includes("lifetime") ? "lifetime" : "pro";
}

export function isInactiveLemonStatus(status: string): boolean {
  return [
    "expired",
    "refunded",
    "revoked",
    "disabled",
    "legacy_expired_unverified",
  ].includes(status);
}

export function lemonEntitlementExternalId(type: string, id: string): string {
  return `${type}:${id}`;
}
