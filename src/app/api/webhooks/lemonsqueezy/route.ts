/**
 * Lemon Squeezy webhook → account plans, zero manual key entry.
 *
 * order_created / subscription_created  → plan: pro (matched by email)
 * subscription_expired                  → plan: free
 *
 * If no account exists for the buyer's email yet, the upgrade is parked in
 * pending_upgrades and applied automatically on their first sign-in (/api/me).
 *
 * Configure in LS: Settings → Webhooks → https://<domain>/api/webhooks/lemonsqueezy
 * with secret LEMONSQUEEZY_WEBHOOK_SECRET.
 */
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pendingUpgrades, usageEvents, users } from "@/db/schema";

export const runtime = "nodejs";

interface LsWebhook {
  meta?: { event_name?: string };
  data?: {
    attributes?: {
      user_email?: string;
      // orders have first_order_item; subscriptions carry product_name directly
      first_order_item?: { product_name?: string };
      product_name?: string;
      status?: string;
    };
  };
}

function verifySignature(raw: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(hmac);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-signature") ?? "";
  if (!signature || !verifySignature(raw, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LsWebhook;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.meta?.event_name ?? "";
  const attrs = payload.data?.attributes;
  const email = attrs?.user_email?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: true, skipped: "no email" });

  const productName = (
    attrs?.first_order_item?.product_name ??
    attrs?.product_name ??
    ""
  ).toLowerCase();
  const plan = productName.includes("lifetime") ? "lifetime" : "pro";

  const db = getDb();

  if (event === "order_created" || event === "subscription_created") {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) {
      await db
        .update(users)
        .set({ plan, planSource: "lemonsqueezy" })
        .where(eq(users.id, user.id));
    } else {
      // Bought before signing up — park it, applied on first sign-in
      await db
        .insert(pendingUpgrades)
        .values({ email, plan })
        .onConflictDoUpdate({ target: pendingUpgrades.email, set: { plan } });
    }
    try {
      await db.insert(usageEvents).values({
        userId: user?.id ?? null,
        event: "purchase_webhook",
        props: { event, plan, matched: !!user },
      });
    } catch {
      // analytics are best-effort
    }
    return NextResponse.json({ ok: true, plan, matched: !!user });
  }

  if (event === "subscription_expired") {
    // Lifetime plans never expire; only downgrade subscription-sourced pro
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user && user.plan === "pro") {
      await db.update(users).set({ plan: "free" }).where(eq(users.id, user.id));
    }
    await db.delete(pendingUpgrades).where(eq(pendingUpgrades.email, email));
    return NextResponse.json({ ok: true, downgraded: !!user });
  }

  return NextResponse.json({ ok: true, ignored: event });
}
