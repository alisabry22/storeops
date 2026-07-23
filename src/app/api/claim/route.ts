/**
 * Legacy-buyer bridge: a Lemon Squeezy license key holder signs in and
 * claims Pro on their account. Validates the key against LS, then flags
 * the account — so Pro follows the account, not the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { usageEvents, users } from "@/db/schema";
import { getUserId } from "@/lib/server/auth";
import { isCommunityEdition } from "@/lib/edition";
import {
  hasConfiguredLemonVariants,
  identifyLemonPlan,
} from "@/lib/server/lemonsqueezy";

export async function POST(req: NextRequest) {
  if (isCommunityEdition) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { licenseKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const licenseKey = body.licenseKey?.trim();
  if (!licenseKey) return NextResponse.json({ error: "licenseKey required" }, { status: 400 });

  // Validate against Lemon Squeezy (public endpoint, no API key needed)
  const upstream = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ license_key: licenseKey }).toString(),
  });
  const result: {
    valid?: boolean;
    error?: string;
    meta?: { product_name?: string; variant_id?: number };
  } = await upstream
    .json()
    .catch(() => ({}));

  if (!result.valid) {
    return NextResponse.json(
      { error: result.error ?? "License key is not valid" },
      { status: 422 }
    );
  }

  if (!hasConfiguredLemonVariants()) {
    return NextResponse.json(
      { error: "StoreOps paid variants are not configured." },
      { status: 503 }
    );
  }
  const plan = identifyLemonPlan({
    product_name: result.meta?.product_name,
    variant_id: result.meta?.variant_id,
  });
  if (!plan) {
    return NextResponse.json(
      { error: "This license is valid, but it is not a StoreOps paid product." },
      { status: 403 }
    );
  }

  const db = getDb();

  // One key = one account
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.lsLicenseKey, licenseKey), ne(users.id, userId)));
  if (taken) {
    return NextResponse.json(
      { error: "This key is already claimed by another account" },
      { status: 409 }
    );
  }

  await db.insert(users).values({ id: userId }).onConflictDoNothing();
  await db
    .update(users)
    .set({ plan, planSource: "lemonsqueezy", lsLicenseKey: licenseKey })
    .where(eq(users.id, userId));

  try {
    await db.insert(usageEvents).values({
      userId,
      event: "license_claimed",
      props: { source: "lemonsqueezy" },
    });
  } catch {
    // analytics are best-effort
  }

  return NextResponse.json({ ok: true, plan });
}
