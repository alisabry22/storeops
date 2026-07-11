/**
 * Account bootstrap: returns the signed-in user's plan, creating the row
 * on first call (Clerk is the identity source; we mirror id + email).
 * Also applies any purchase that arrived by webhook before the account
 * existed (pending_upgrades, keyed by checkout email).
 */
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { pendingUpgrades, users } from "@/db/schema";
import { getUserId } from "@/lib/server/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  let [user] = await db.select().from(users).where(eq(users.id, userId));

  if (!user) {
    const cu = await currentUser();
    await db
      .insert(users)
      .values({
        id: userId,
        email: cu?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null,
      })
      .onConflictDoNothing();
    [user] = await db.select().from(users).where(eq(users.id, userId));
  }

  // Bought before signing up? The webhook parked the upgrade — apply it now.
  if (user.plan === "free" && user.email) {
    const [pending] = await db
      .select()
      .from(pendingUpgrades)
      .where(eq(pendingUpgrades.email, user.email));
    if (pending) {
      await db
        .update(users)
        .set({
          plan: pending.plan,
          planSource: "lemonsqueezy",
          lsLicenseKey: pending.lsLicenseKey,
        })
        .where(eq(users.id, user.id));
      await db.delete(pendingUpgrades).where(eq(pendingUpgrades.email, user.email));
      user = { ...user, plan: pending.plan };
    }
  }

  return NextResponse.json({ plan: user.plan, email: user.email });
}
