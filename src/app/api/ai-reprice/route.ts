import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/server/auth";
import type { PricingStrategy } from "@/lib/pricing-strategies";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
const ALLOWED_STRATEGIES = new Set<PricingStrategy>(["ppp", "growth", "revenue", "retention", "enterprise"]);
/**
 * AI may help a developer configure a bounded policy, but it never returns
 * production territory prices. Actual price calculation stays deterministic.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.plan === "free") return NextResponse.json({ error: "AI policy assistant requires Pro or Lifetime." }, { status: 403 });

  const { instructions, platform = "ios" } = await req.json() as { instructions?: string; platform?: "ios" | "android" };
  if (!instructions?.trim()) return NextResponse.json({ error: "Describe the pricing goal first." }, { status: 400 });

  const result = await genAI.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: `You configure a cautious ${platform} pricing policy. Return JSON only: {"strategy":"ppp|growth|revenue|retention|enterprise","maxChangePercent":number,"summary":"short sentence"}.\n\nUse retention for requests to avoid movement, growth for accessibility/acquisition, revenue for modest increases, enterprise for professional positioning, otherwise ppp. maxChangePercent must be 1 to 50 and should be conservative unless explicitly requested. Never calculate prices, currencies, country lists, or a CSV.\n\nDeveloper request: ${instructions.trim()}`,
    config: { responseMimeType: "application/json" },
  });
  try {
    const raw = JSON.parse(result.text ?? "{}") as { strategy?: PricingStrategy; maxChangePercent?: number; summary?: string };
    const strategy = raw.strategy && ALLOWED_STRATEGIES.has(raw.strategy) ? raw.strategy : "ppp";
    const maxChangePercent = Math.max(1, Math.min(50, Number(raw.maxChangePercent) || 25));
    return NextResponse.json({ policy: { strategy, maxChangePercent, summary: String(raw.summary ?? "Policy updated. See the generated preview before applying.") } });
  } catch {
    return NextResponse.json({ error: "The AI returned an invalid policy. Try a shorter request." }, { status: 502 });
  }
}
