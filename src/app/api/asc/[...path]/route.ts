/**
 * Thin proxy to the App Store Connect API.
 * Exists ONLY because Apple blocks CORS from browsers.
 *
 * Security model: this route receives the user's short-lived (≤20 min) JWT
 * in the Authorization header and forwards it verbatim. It never sees the
 * .p8 private key, stores nothing, and logs nothing about the request body.
 */
import { NextRequest, NextResponse } from "next/server";

const ASC_BASE = "https://api.appstoreconnect.apple.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE"]);

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 }
    );
  }

  const { path } = await params;
  const url = new URL(`${ASC_BASE}/${path.join("/")}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const body =
    req.method === "GET" || req.method === "DELETE"
      ? undefined
      : await req.text();

  const upstream = await fetch(url.toString(), {
    method: req.method,
    headers: {
      Authorization: auth,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
