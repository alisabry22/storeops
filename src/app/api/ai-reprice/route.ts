import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDb } from "@/db";
import { usageEvents, users } from "@/db/schema";
import { and, count, eq, gte } from "drizzle-orm";
import { getUserId } from "@/lib/server/auth";
import type { PricingStrategy } from "@/lib/pricing-strategies";
import { isCommunityEdition } from "@/lib/edition";

const ALLOWED_STRATEGIES = new Set<PricingStrategy>(["ppp", "growth", "revenue", "retention", "enterprise"]);
/**
 * AI may help a developer configure a bounded policy, but it never returns
 * production territory prices. Actual price calculation stays deterministic.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!isCommunityEdition && !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "The AI policy assistant is disabled. Configure GEMINI_API_KEY or choose a policy manually." },
      { status: 503 },
    );
  }

  const db = isCommunityEdition ? null : getDb();
  if (!isCommunityEdition) {
    const [user] = await db!
      .select()
      .from(users)
      .where(eq(users.id, userId!))
      .limit(1);
    if (!user || user.plan === "free") {
      return NextResponse.json({ error: "AI policy assistant requires Pro or Lifetime." }, { status: 403 });
    }
  }

  const { instructions, platform = "ios" } = await req.json() as { instructions?: string; platform?: "ios" | "android" };
  if (!instructions?.trim()) return NextResponse.json({ error: "Describe the pricing goal first." }, { status: 400 });
  if (instructions.trim().length > 500) return NextResponse.json({ error: "Keep the pricing goal under 500 characters." }, { status: 400 });
  if (platform !== "ios" && platform !== "android") return NextResponse.json({ error: "Unsupported platform." }, { status: 400 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (!isCommunityEdition) {
    const [usage] = await db!
      .select({ value: count() })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId!),
          eq(usageEvents.event, "ai_policy_request"),
          gte(usageEvents.createdAt, since)
        )
      );
    if (Number(usage?.value ?? 0) >= 20) {
      return NextResponse.json(
        { error: "Daily AI policy limit reached. You can still choose a deterministic policy manually." },
        { status: 429 }
      );
    }
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await genAI.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `You configure a cautious ${platform} pricing policy. Return JSON only: {"strategy":"ppp|growth|revenue|retention|enterprise","maxChangePercent":number,"summary":"short sentence"}.\n\nUse retention for requests to avoid movement, growth for accessibility/acquisition, revenue for modest increases, enterprise for professional positioning, otherwise ppp. maxChangePercent must be 1 to 50 and should be conservative unless explicitly requested. Never calculate prices, currencies, country lists, or a CSV.\n\nDeveloper request: ${instructions.trim()}`,
      config: { responseMimeType: "application/json", maxOutputTokens: 180 },
    });
    const raw = JSON.parse(result.text ?? "{}") as { strategy?: PricingStrategy; maxChangePercent?: number; summary?: string };
    const strategy = raw.strategy && ALLOWED_STRATEGIES.has(raw.strategy) ? raw.strategy : "ppp";
    const maxChangePercent = Math.max(1, Math.min(50, Number(raw.maxChangePercent) || 25));
    if (!isCommunityEdition) {
      await db!.insert(usageEvents).values({
        userId: userId!,
        event: "ai_policy_request",
        props: { platform, strategy, maxChangePercent },
      });
    }
    return NextResponse.json({ policy: { strategy, maxChangePercent, summary: String(raw.summary ?? "Policy updated. See the generated preview before applying.") } });
  } catch (error) {
    console.error("AI policy configuration failed", error);
    return NextResponse.json({ error: "The AI policy assistant is temporarily unavailable. Choose a policy manually or try again." }, { status: 502 });
  }
}
