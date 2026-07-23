/**
 * Server-side auth guard that tolerates local-only mode: when Clerk env
 * keys are missing (accounts disabled), every request is simply anonymous
 * instead of auth() throwing a 500.
 */
import { auth } from "@clerk/nextjs/server";
import { isCommunityEdition } from "@/lib/edition";

export const accountsEnabled =
  !isCommunityEdition &&
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !!process.env.CLERK_SECRET_KEY;

export async function getUserId(): Promise<string | null> {
  if (!accountsEnabled) return null;
  try {
    const { userId } = await auth();
    return userId;
  } catch {
    return null;
  }
}
