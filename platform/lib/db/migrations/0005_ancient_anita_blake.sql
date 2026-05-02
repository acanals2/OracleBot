ALTER TYPE "public"."finding_category" ADD VALUE 'exposed_secret';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'missing_rls';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'client_key_leak';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'tool_poisoning';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'pii_echo';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'schema_violation';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'capability_escalation';--> statement-breakpoint
ALTER TYPE "public"."finding_category" ADD VALUE 'credential_in_tool_desc';--> statement-breakpoint
ALTER TABLE "run_findings" ADD COLUMN "probe_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "packs" jsonb;