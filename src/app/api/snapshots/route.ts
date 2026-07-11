/**
 * Server-side snapshot sync. localStorage stays the offline cache;
 * signed-in users get snapshots that survive cache clears and follow
 * them across devices. Rows are opaque JSON — same shape as the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { snapshots, users } from "@/db/schema";
import { getUserId as requireUser } from "@/lib/server/auth";

const MAX_PER_SCOPE = 25;

export async function GET(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appId = req.nextUrl.searchParams.get("appId");
  const scope = req.nextUrl.searchParams.get("scope");
  if (!appId || !scope) {
    return NextResponse.json({ error: "appId and scope required" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.userId, userId),
        eq(snapshots.appId, appId),
        eq(snapshots.scope, scope)
      )
    )
    .orderBy(desc(snapshots.createdAt))
    .limit(MAX_PER_SCOPE);

  return NextResponse.json({
    snapshots: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      appId: r.appId,
      scope: r.scope,
      label: r.label,
      baseTerritory: r.baseTerritory ?? undefined,
      rows: r.rows,
    })),
  });
}

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    id?: string;
    appId?: string;
    scope?: string;
    label?: string;
    baseTerritory?: string;
    rows?: unknown[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, appId, scope, label, baseTerritory, rows } = body;
  if (!id || !appId || !scope || !label || !Array.isArray(rows)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: "Too many rows" }, { status: 400 });
  }

  const db = getDb();
  // User row must exist (FK). Cheap upsert covers first-write-before-/api/me.
  await db.insert(users).values({ id: userId }).onConflictDoNothing();

  await db
    .insert(snapshots)
    .values({ id, userId, appId, scope, label, baseTerritory, rows })
    .onConflictDoNothing();

  // Prune beyond cap (oldest first)
  const all = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(
      and(
        eq(snapshots.userId, userId),
        eq(snapshots.appId, appId),
        eq(snapshots.scope, scope)
      )
    )
    .orderBy(asc(snapshots.createdAt));
  if (all.length > MAX_PER_SCOPE) {
    for (const old of all.slice(0, all.length - MAX_PER_SCOPE)) {
      await db.delete(snapshots).where(eq(snapshots.id, old.id));
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const userId = await requireUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  await db
    .delete(snapshots)
    .where(and(eq(snapshots.id, id), eq(snapshots.userId, userId)));

  return NextResponse.json({ ok: true });
}
