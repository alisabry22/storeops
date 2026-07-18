/**
 * SaaS data layer — Postgres (Neon) via Drizzle.
 * Identity lives in Clerk; `users.id` IS the Clerk user id.
 * Credentials (.p8 keys / service accounts) are NEVER stored here — they
 * stay client-side per device. This is metadata, plans, and snapshots only.
 */
import {
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  /** Clerk user id (e.g. "user_2ab...") */
  id: text("id").primaryKey(),
  email: text("email"),
  /** free | pro | lifetime */
  plan: text("plan").notNull().default("free"),
  /** lemonsqueezy | stripe | manual */
  planSource: text("plan_source"),
  /** Lemon Squeezy key claimed by this account (legacy buyers) */
  lsLicenseKey: text("ls_license_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const snapshots = pgTable(
  "snapshots",
  {
    /** Client-generated id ("snap_..."), shared with localStorage copy */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** appstore | googleplay — future-proofing for Play support */
    platform: text("platform").notNull().default("appstore"),
    appId: text("app_id").notNull(),
    /** "app-pricing" | `sub:${id}` | `iap:${id}` */
    scope: text("scope").notNull(),
    label: text("label").notNull(),
    baseTerritory: text("base_territory"),
    rows: jsonb("rows").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("snapshots_user_scope_idx").on(t.userId, t.appId, t.scope)]
);

/**
 * Purchases that arrived (via Lemon Squeezy webhook) before the buyer had an
 * account. Keyed by checkout email; applied and deleted on first sign-in.
 */
export const pendingUpgrades = pgTable("pending_upgrades", {
  email: text("email").primaryKey(),
  /** pro | lifetime */
  plan: text("plan").notNull().default("pro"),
  lsLicenseKey: text("ls_license_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * One row per Lemon Squeezy order/subscription. Keeping entitlements separate
 * prevents an old expired subscription from downgrading a newer active one.
 */
export const billingEntitlements = pgTable(
  "billing_entitlements",
  {
    /** Namespaced Lemon Squeezy resource ID, e.g. `orders:1`. */
    externalId: text("external_id").primaryKey(),
    email: text("email").notNull(),
    userId: text("user_id"),
    kind: text("kind").notNull(),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    productId: text("product_id"),
    variantId: text("variant_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("billing_entitlements_email_idx").on(t.email)]
);

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  event: text("event").notNull(),
  props: jsonb("props"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
