ALTER TABLE "ccos_next_actions" ADD COLUMN "rule_key" varchar(128);--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "dedupe_key" varchar(255);--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "waiting_reason" text;--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_next_actions_active_generated_dedupe_idx" ON "ccos_next_actions" USING btree ("workspace_id","dedupe_key") WHERE "ccos_next_actions"."generated_automatically" = true AND "ccos_next_actions"."status" IN ('open', 'in_progress', 'waiting');