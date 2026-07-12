import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "@/lib/server/auth";
import { GP_NOT_BILLABLE, GP_USD_PRICE_CAPS } from "@/lib/gp/types";
import { getStrategy, type PricingStrategy } from "@/lib/pricing-strategies";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

function buildConstraints(platform: "ios" | "android"): string {
  const base = [
    "\n\nHARD CONSTRAINTS — these override everything above and must be followed exactly:",
    "- Return ONLY the CSV. No explanation, no markdown, no code fences — just the raw CSV rows.",
    "- Include every territory from the input. Do not add or remove territories.",
    "- Do NOT change territory/region codes.",
  ];

  if (platform === "android") {
    const capsNote = Object.entries(GP_USD_PRICE_CAPS)
      .map(([code, { min, max }]) => `  - ${code}: min $${min} USD, max $${max} USD`)
      .join("\n");
    base.push(
      `- Do NOT include these regions (not billable on Google Play): ${[...GP_NOT_BILLABLE].join(", ")}`,
      "- These regions use USD but have Google-imposed price limits:",
      capsNote,
      "- Do NOT change the currency column — use exactly the currency shown per region.",
    );
  }

  return base.join("\n");
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.plan === "free") {
    return NextResponse.json(
      { error: "AI Reprice requires a Pro or Lifetime plan." },
      { status: 403 }
    );
  }

  const body = await req.json() as {
    csv: string;
    strategy: PricingStrategy;
    customInstructions?: string;
    platform?: "ios" | "android";
  };

  const { csv, strategy, customInstructions, platform = "android" } = body;
  if (!csv || !strategy) {
    return NextResponse.json({ error: "Missing csv or strategy" }, { status: 400 });
  }

  const basePrompt = getStrategy(strategy)
    .buildPrompt(csv)
    .replaceAll("iOS app", platform === "android" ? "Android app" : "iOS app")
    .replaceAll("App Store territories", platform === "android" ? "Google Play regions" : "App Store territories")
    .replaceAll("ISO 3166-1 alpha-3", platform === "android" ? "ISO 3166-1 alpha-2" : "ISO 3166-1 alpha-3");

  const customBlock = customInstructions?.trim()
    ? `\n\nAdditional requirements from the developer (apply these on top of the strategy above):\n${customInstructions.trim()}`
    : "";

  const fullPrompt = basePrompt + customBlock + buildConstraints(platform);

  const result = await genAI.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: fullPrompt,
  });
  const raw = result.text ?? "";

  // Strip any accidental markdown fences the model might add
  const csvText = raw
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  return NextResponse.json({ csv: csvText });
}
