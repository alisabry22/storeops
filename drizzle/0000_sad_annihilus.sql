CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text DEFAULT 'appstore' NOT NULL,
	"app_id" text NOT NULL,
	"scope" text NOT NULL,
	"label" text NOT NULL,
	"base_territory" text,
	"rows" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"event" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_source" text,
	"ls_license_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "snapshots_user_scope_idx" ON "snapshots" USING btree ("user_id","app_id","scope");