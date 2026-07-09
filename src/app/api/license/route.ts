/**
 * Thin proxy to the Lemon Squeezy License API (blocks browser CORS).
 * These endpoints are public — no API key involved. We store nothing.
 */
import { NextRequest, NextResponse } from "next/server";

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
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
