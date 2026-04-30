CREATE TABLE "dead_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"job_name" text NOT NULL,
	"job_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"failed_reason" text,
	"stack" text,
	"attempts_made" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dead_jobs_queue_idx" ON "dead_jobs" USING btree ("queue","created_at");--> statement-breakpoint
CREATE INDEX "dead_jobs_created_at_idx" ON "dead_jobs" USING btree ("created_at");