CREATE TYPE "public"."verification_method" AS ENUM('dns_txt', 'well_known_file');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'verified', 'failed', 'expired');--> statement-breakpoint
CREATE TABLE "target_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"domain" text NOT NULL,
	"challenge_token" text NOT NULL,
	"method" "verification_method" NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "target_verifications" ADD CONSTRAINT "target_verifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "target_verifications_org_domain_idx" ON "target_verifications" USING btree ("org_id","domain");--> statement-breakpoint
CREATE INDEX "target_verifications_status_idx" ON "target_verifications" USING btree ("status");