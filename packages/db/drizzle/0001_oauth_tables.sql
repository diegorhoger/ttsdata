CREATE TABLE IF NOT EXISTS "oauth_probe_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result_id_hash" varchar(64) NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"data" jsonb NOT NULL,
	"scopes" varchar(255) DEFAULT '' NOT NULL,
	"both_succeeded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_probe_results_result_id_hash_idx" ON "oauth_probe_results" USING btree ("result_id_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_probe_results_expired_idx" ON "oauth_probe_results" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "oauth_states_state_hash_idx" ON "oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_states_expired_idx" ON "oauth_states" USING btree ("expires_at");