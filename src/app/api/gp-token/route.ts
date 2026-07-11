/**
 * OAuth token exchange proxy for Google service accounts.
 * The browser signs the JWT assertion locally (the key never leaves the
 * device); this route just forwards the assertion to Google's token
 * endpoint, which blocks CORS. We store nothing and log nothing.
 */
import { NextRequest, NextResponse } from "next/server";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export async function POST(req: NextRequest) {
  let body: { assertion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.assertion) {
    return NextResponse.json({ error: "assertion required" }, { status: 400 });
  }

  const upstream = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: body.assertion,
    }).toString(),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}
