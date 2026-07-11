import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: ReturnType<typeof create> | null = null;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — create a Neon database and add it to .env.local");
  return drizzle(neon(url), { schema });
}

export function getDb() {
  cached ??= create();
  return cached;
}
