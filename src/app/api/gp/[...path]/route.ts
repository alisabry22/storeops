/**
 * Thin proxy to the Google Play Developer API.
 * Exists ONLY because androidpublisher blocks CORS from browsers.
 *
 * Same security model as /api/asc: receives the user's short-lived OAuth
 * token in the Authorization header and forwards it verbatim. It never
 * sees the service-account key, stores nothing, logs nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { canWriteToStores } from "@/lib/server/write-access";
import { isNonMutatingGoogleOperation } from "@/lib/server/google-proxy-policy";

const GP_BASE = "https://androidpublisher.googleapis.com";
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  if (!ALLOWED_METHODS.has(req.method)) {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const auth = req.headers.get("x-store-authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing Authorization header" },
      { status: 401 }
    );
  }

  const { path } = await params;
  if (path[0] !== "androidpublisher" || path[1] !== "v3" || path[2] !== "applications") {
    return NextResponse.json({ error: "Unsupported Google Play API path" }, { status: 400 });
  }
  const joinedPath = path.join("/");
  if (!isNonMutatingGoogleOperation(req.method, joinedPath) && !(await canWriteToStores(req))) {
    return NextResponse.json(
      { error: "A StoreOps Pro or Lifetime entitlement is required for store writes." },
      { status: 403 }
    );
  }

  const url = new URL(`${GP_BASE}/${joinedPath}`);
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

  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }

  const responseBody = await upstream.text();
  return new NextResponse(responseBody, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
