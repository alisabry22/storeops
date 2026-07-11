/**
 * Account bootstrap: returns the signed-in user's plan, creating the row
 * on first call (Clerk is the identity source; we mirror id + email).
 */
import { currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
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
        email: cu?.primaryEmailAddress?.emailAddress ?? null,
      })
      .onConflictDoNothing();
    [user] = await db.select().from(users).where(eq(users.id, userId));
  }

  return NextResponse.json({ plan: user.plan, email: user.email });
}
