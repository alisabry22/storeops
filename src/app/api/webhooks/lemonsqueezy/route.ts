import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  billingEntitlements,
  pendingUpgrades,
  usageEvents,
  users,
} from "@/db/schema";
import {
  identifyLemonPlan,
  isInactiveLemonStatus,
  lemonEntitlementExternalId,
  verifyLemonSignatureWithRotation,
} from "@/lib/server/lemonsqueezy";
import { isCommunityEdition } from "@/lib/edition";

export const runtime = "nodejs";

export interface LsWebhook {
  meta?: {
    event_name?: string;
    custom_data?: { user_id?: string | number };
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: {
      user_email?: string;
      first_order_item?: {
        product_name?: string;
        product_id?: number;
        variant_id?: number;
      };
      product_name?: string;
      product_id?: number;
      variant_id?: number;
      status?: string;
    };
  };
}

async function recomputeCustomerPlan(
  email: string,
  options: { preserveLegacyPaid?: boolean; userId?: string } = {}
) {
  const db = getDb();
  const entitlements = await db
    .select()
    .from(billingEntitlements)
    .where(eq(billingEntitlements.email, email));
  const active = entitlements.filter(
    (item) => !isInactiveLemonStatus(item.status)
  );
  const plan = active.some((item) => item.plan === "lifetime")
    ? "lifetime"
    : active.some((item) => item.plan === "pro")
      ? "pro"
      : "free";
  const [user] = await db
    .select()
    .from(users)
    .where(
      options.userId ? eq(users.id, options.userId) : eq(users.email, email)
    );

  // The entitlement ledger is new. A first-seen expiry for a subscription
  // created before this ledger cannot prove there is no newer paid purchase.
  // Keep the existing paid account until this external subscription has first
  // been observed active. Explicit refunds are never preserved this way.
  if (
    options.preserveLegacyPaid &&
    user &&
    user.planSource === "lemonsqueezy" &&
    (user.plan === "pro" || user.plan === "lifetime") &&
    plan === "free"
  ) {
    return { plan: user.plan, matched: true, preservedLegacy: true };
  }

  if (user && (user.planSource === "lemonsqueezy" || user.plan === "free")) {
    await db
      .update(users)
      .set({ plan, planSource: plan === "free" ? null : "lemonsqueezy" })
      .where(eq(users.id, user.id));
  }

  if (plan === "free") {
    await db.delete(pendingUpgrades).where(eq(pendingUpgrades.email, email));
  } else if (!user) {
    await db
      .insert(pendingUpgrades)
      .values({ email, plan })
      .onConflictDoUpdate({ target: pendingUpgrades.email, set: { plan } });
  }
  return { plan, matched: !!user };
}

export async function POST(req: NextRequest) {
  if (isCommunityEdition) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-signature") ?? "";
  if (
    !signature ||
    !verifyLemonSignatureWithRotation(
      raw,
      signature,
      secret,
      process.env.LEMONSQUEEZY_WEBHOOK_SECRET_PREVIOUS
    )
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LsWebhook;
  try {
    payload = JSON.parse(raw) as LsWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.meta?.event_name ?? "";
  const attrs = payload.data?.attributes;
  const email = attrs?.user_email?.toLowerCase().trim();
  const customUserIdValue = payload.meta?.custom_data?.user_id;
  const customUserId =
    customUserIdValue === undefined ? undefined : String(customUserIdValue);
  const rawExternalId = payload.data?.id;
  const resourceType = payload.data?.type ?? "unknown";
  if (!email || !rawExternalId) {
    return NextResponse.json({ ok: true, skipped: "missing customer identity" });
  }
  // Lemon Squeezy IDs are scoped to their resource collection. Prefixing the
  // type prevents an order and subscription with the same numeric ID from
  // overwriting one another in the entitlement ledger.
  const externalId = lemonEntitlementExternalId(resourceType, rawExternalId);

  const plan = identifyLemonPlan(attrs);
  if (!plan) {
    return NextResponse.json({ ok: true, skipped: "unknown StoreOps variant" });
  }

  const isLifetimeOrder = event === "order_created" && plan === "lifetime";
  const isSubscriptionEvent = event.startsWith("subscription_");
  const isRefund = event === "order_refunded";
  if (!isLifetimeOrder && !isSubscriptionEvent && !isRefund) {
    return NextResponse.json({ ok: true, ignored: event });
  }

  const inactiveEvent = event === "subscription_expired" || isRefund;
  const item = attrs?.first_order_item;
  const productId = attrs?.product_id ?? item?.product_id;
  const variantId = attrs?.variant_id ?? item?.variant_id;
  const db = getDb();
  let [user] = await db
    .select()
    .from(users)
    .where(customUserId ? eq(users.id, customUserId) : eq(users.email, email));
  if (!user && customUserId) {
    [user] = await db.select().from(users).where(eq(users.email, email));
  }
  const [existingEntitlement] = await db
    .select({ status: billingEntitlements.status })
    .from(billingEntitlements)
    .where(eq(billingEntitlements.externalId, externalId))
    .limit(1);
  const preserveLegacyPaid =
    event === "subscription_expired" &&
    (existingEntitlement?.status === "legacy_expired_unverified" ||
      (!existingEntitlement &&
        user?.planSource === "lemonsqueezy" &&
        (user.plan === "pro" || user.plan === "lifetime")));
  const status = preserveLegacyPaid
    ? "legacy_expired_unverified"
    : inactiveEvent
      ? isRefund
        ? "refunded"
        : "expired"
      : attrs?.status ?? "active";

  await db
    .insert(billingEntitlements)
    .values({
      externalId,
      email,
      userId: user?.id ?? null,
      kind: resourceType,
      plan,
      status,
      productId: productId ? String(productId) : null,
      variantId: variantId ? String(variantId) : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: billingEntitlements.externalId,
      set: {
        email,
        userId: user?.id ?? null,
        plan,
        status,
        productId: productId ? String(productId) : null,
        variantId: variantId ? String(variantId) : null,
        updatedAt: new Date(),
      },
    });

  const result = await recomputeCustomerPlan(email, {
    preserveLegacyPaid,
    userId: user?.id,
  });
  try {
    await db.insert(usageEvents).values({
      userId: user?.id ?? null,
      event: "purchase_webhook",
      props: { event, externalId, plan, status, resolvedPlan: result.plan },
    });
  } catch {
    // Analytics never block entitlement processing.
  }
  return NextResponse.json({ ok: true, ...result });
}
