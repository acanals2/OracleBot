ALTER TABLE "runs" ADD COLUMN "product_key" text;--> statement-breakpoint
CREATE INDEX "runs_org_product_created_idx" ON "runs" USING btree ("org_id","product_key","created_at");