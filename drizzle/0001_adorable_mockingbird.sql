CREATE TABLE IF NOT EXISTS "billing_entitlements" (
	"external_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"product_id" text,
	"variant_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pending_upgrades" (
	"email" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'pro' NOT NULL,
	"ls_license_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_entitlements_email_idx" ON "billing_entitlements" USING btree ("email");
