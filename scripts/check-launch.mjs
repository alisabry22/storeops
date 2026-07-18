import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const errors = [];
const warnings = [];

function value(name) {
  return (process.env[name] ?? "").trim();
}

function requireValue(name, message) {
  if (!value(name)) errors.push(`${name}: ${message}`);
}

function requireHttpsUrl(name, message) {
  const raw = value(name);
  if (!raw) {
    errors.push(`${name}: ${message}`);
    return;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") errors.push(`${name}: must use HTTPS.`);
  } catch {
    errors.push(`${name}: must be a valid absolute URL.`);
  }
}

requireHttpsUrl("NEXT_PUBLIC_SITE_URL", "set the canonical production URL.");
requireValue("DATABASE_URL", "set the production Postgres connection string.");
requireValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "set the Clerk publishable key.");
requireValue("CLERK_SECRET_KEY", "set the matching Clerk secret key.");
requireValue("GEMINI_API_KEY", "set the key used by the bounded AI policy assistant.");
requireHttpsUrl("NEXT_PUBLIC_LS_CHECKOUT_URL", "set the yearly checkout URL.");
requireHttpsUrl(
  "NEXT_PUBLIC_LS_LIFETIME_CHECKOUT_URL",
  "set the lifetime checkout URL."
);
requireValue("LEMONSQUEEZY_WEBHOOK_SECRET", "copy the webhook signing secret from Lemon Squeezy.");
requireValue(
  "STOREOPS_LICENSE_PROOF_SECRET",
  "generate an independent random secret of at least 32 characters."
);

const publishableKey = value("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
const secretKey = value("CLERK_SECRET_KEY");
const publishableFamily = publishableKey.startsWith("pk_live_")
  ? "live"
  : publishableKey.startsWith("pk_test_")
    ? "test"
    : "unknown";
const secretFamily = secretKey.startsWith("sk_live_")
  ? "live"
  : secretKey.startsWith("sk_test_")
    ? "test"
    : "unknown";
if (publishableKey && secretKey && publishableFamily !== secretFamily) {
  errors.push("Clerk: publishable and secret keys use different environments.");
}
if (publishableFamily === "test" || secretFamily === "test") {
  errors.push("Clerk: replace test keys with a matching live-key pair before launch.");
}

const webhookSecret = value("LEMONSQUEEZY_WEBHOOK_SECRET");
const proofSecret = value("STOREOPS_LICENSE_PROOF_SECRET");
if (webhookSecret && webhookSecret.length < 24) {
  errors.push("LEMONSQUEEZY_WEBHOOK_SECRET: value is unexpectedly short.");
}
if (webhookSecret.length > 40) {
  errors.push("LEMONSQUEEZY_WEBHOOK_SECRET: Lemon Squeezy allows at most 40 characters.");
}
if (proofSecret && proofSecret.length < 32) {
  errors.push("STOREOPS_LICENSE_PROOF_SECRET: use at least 32 characters.");
}
if (webhookSecret && proofSecret && webhookSecret === proofSecret) {
  errors.push("Billing: webhook and license-proof secrets must be independent.");
}

const proIds = new Set(
  value("LEMONSQUEEZY_PRO_VARIANT_IDS").split(",").map((item) => item.trim()).filter(Boolean)
);
const lifetimeIds = new Set(
  value("LEMONSQUEEZY_LIFETIME_VARIANT_IDS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
const allowedIds = new Set(
  value("LEMONSQUEEZY_ALLOWED_VARIANT_IDS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
if (proIds.size === 0) errors.push("LEMONSQUEEZY_PRO_VARIANT_IDS: add the yearly variant.");
if (lifetimeIds.size === 0) {
  errors.push("LEMONSQUEEZY_LIFETIME_VARIANT_IDS: add the lifetime variant.");
}
for (const id of [...proIds, ...lifetimeIds, ...allowedIds]) {
  if (!/^\d+$/.test(id)) errors.push(`Lemon Squeezy: variant ID ${id} is not numeric.`);
}
for (const id of proIds) {
  if (lifetimeIds.has(id)) errors.push(`Lemon Squeezy: variant ${id} is in both plans.`);
  if (!allowedIds.has(id)) errors.push(`Lemon Squeezy: yearly variant ${id} is not allowed.`);
}
for (const id of lifetimeIds) {
  if (!allowedIds.has(id)) errors.push(`Lemon Squeezy: lifetime variant ${id} is not allowed.`);
}

if (value("STOREOPS_ALLOW_UNLICENSED_WRITES") === "true") {
  errors.push("STOREOPS_ALLOW_UNLICENSED_WRITES: must not be true for launch.");
}
if (!value("NEXT_PUBLIC_LS_CUSTOMER_PORTAL_URL")) {
  warnings.push("NEXT_PUBLIC_LS_CUSTOMER_PORTAL_URL: optional, but recommended for self-service billing.");
}

if (errors.length > 0) {
  console.error("StoreOps launch check failed:\n");
  for (const error of errors) console.error(`  - ${error}`);
  if (warnings.length > 0) {
    console.error("\nWarnings:");
    for (const warning of warnings) console.error(`  - ${warning}`);
  }
  process.exitCode = 1;
} else {
  console.log("StoreOps launch configuration passed.");
  for (const warning of warnings) console.log(`Warning: ${warning}`);
}
