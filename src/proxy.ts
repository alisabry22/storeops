import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isCommunityEdition } from "@/lib/edition";

/**
 * Auth is opt-in by env: until Clerk keys are configured the app runs in
 * local-only mode (no accounts) and the proxy is a no-op. This keeps dev and
 * self-hosted setups working without a Clerk account.
 */
const clerkEnabled =
  !isCommunityEdition && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    // Store proxies use X-Store-Authorization for upstream tokens, leaving
    // Clerk free to inspect the regular session and enforce paid writes.
    "/((?!_next|api/gp-token|api/license|api/claim|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
