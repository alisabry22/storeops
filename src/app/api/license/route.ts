/**
 * Thin proxy to the Lemon Squeezy License API (blocks browser CORS).
 * These endpoints are public — no API key involved. We store nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { issueLegacyWriteProof } from "@/lib/server/write-access";

const LS_BASE = "https://api.lemonsqueezy.com/v1/licenses";
const ACTIONS = new Set(["activate", "validate", "deactivate"]);

export async function POST(req: NextRequest) {
  let payload: {
    action?: string;
    license_key?: string;
    instance_id?: string;
    instance_name?: string;
  };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, license_key, instance_id, instance_name } = payload;
  if (!action || !ACTIONS.has(action) || !license_key) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const form = new URLSearchParams({ license_key });
  if (instance_id) form.set("instance_id", instance_id);
  if (instance_name) form.set("instance_name", instance_name);

  const upstream = await fetch(`${LS_BASE}/${action}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const body = await upstream.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const meta = (json.meta ?? {}) as Record<string, unknown>;
  const valid = action === "activate" ? json.activated === true : json.valid === true;
  const allowedVariants = new Set(
    (process.env.LEMONSQUEEZY_ALLOWED_VARIANT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const variantId = meta.variant_id ? String(meta.variant_id) : "";
  if (valid && allowedVariants.size > 0 && !allowedVariants.has(variantId)) {
    return NextResponse.json(
      { error: "This license is valid, but it is not a StoreOps paid product." },
      { status: 403 }
    );
  }

  if (upstream.ok && valid && action !== "deactivate") {
    const proof = await issueLegacyWriteProof({
      licenseKey: license_key,
      instanceId: instance_id ?? (json.instance as { id?: string } | undefined)?.id,
      productId: meta.product_id as string | number | undefined,
      variantId: meta.variant_id as string | number | undefined,
    });
    if (!proof && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Legacy license proof signing is not configured." },
        { status: 503 }
      );
    }
    if (proof) {
      json.write_token = proof.token;
      json.write_token_expires_at = proof.expiresAt;
    }
  }

  return NextResponse.json(json, { status: upstream.status });
}
