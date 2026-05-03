CREATE TYPE "public"."webhook_platform" AS ENUM('lovable', 'v0', 'bolt', 'replit_agent', 'generic');--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"platform" "webhook_platform" NOT NULL,
	"external_project_id" text NOT NULL,
	"label" text NOT NULL,
	"secret" text NOT NULL,
	"packs" jsonb NOT NULL,
	"product_key" text NOT NULL,
	"min_score" integer,
	"target_verification_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_target_verification_id_target_verifications_id_fk" FOREIGN KEY ("target_verification_id") REFERENCES "public"."target_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_subscriptions_org_idx" ON "webhook_subscriptions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_subscriptions_platform_project_idx" ON "webhook_subscriptions" USING btree ("platform","external_project_id");