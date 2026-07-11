import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Auth is opt-in by env: until Clerk keys are configured the app runs in
 * local-only mode (no accounts) and middleware is a no-op. This keeps dev
 * and self-hosted setups working without a Clerk account.
 */
const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Skip Next internals, static assets, and the proxy/webhook API routes
    // that auth themselves via in-band bearer tokens (Apple/Google/Lemon
    // Squeezy) — running Clerk middleware on those only risks header-size
    // crashes (MIDDLEWARE_INVOCATION_FAILED) and buys nothing. Only /api/me
    // and /api/snapshots actually need Clerk state.
    "/((?!_next|api/asc|api/gp|api/gp-token|api/license|api/claim|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
