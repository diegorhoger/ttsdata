CREATE TABLE IF NOT EXISTS "ai_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_consents" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"version" text NOT NULL,
	"require_zdr" boolean DEFAULT true NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_global_controls" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"encrypted_key" text NOT NULL,
	"encryption_version" integer NOT NULL,
	"fingerprint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"validated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reserved_requests" integer NOT NULL,
	"reserved_tokens" bigint NOT NULL,
	"reserved_usd" numeric(20, 12) NOT NULL,
	"charged_tokens" bigint,
	"charged_usd" numeric(20, 12),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_tenant_controls" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mode" text NOT NULL,
	"provider" text NOT NULL,
	"selected_model" text NOT NULL,
	"resolved_model" text,
	"resolved_provider" text,
	"provider_request_id" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"outcome" text NOT NULL,
	"error_code" text,
	"attempts" integer NOT NULL,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"total_tokens" bigint,
	"cost_usd" numeric(20, 12),
	"cost_source" text NOT NULL,
	"finish_reason" text,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_ledger_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_user_controls" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"platform_enabled" boolean DEFAULT false NOT NULL,
	"max_concurrent" integer DEFAULT 2 NOT NULL,
	"daily_requests" integer DEFAULT 30 NOT NULL,
	"daily_tokens" bigint DEFAULT 100000 NOT NULL,
	"daily_spend_usd" numeric(20, 12) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
-- Composite reservation reference must exist before the dependent ledger FK.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_reservations_identity_id_idx" ON "ai_reservations" USING btree ("workspace_id","user_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_audit" ADD CONSTRAINT "ai_audit_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_audit" ADD CONSTRAINT "ai_audit_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_keys" ADD CONSTRAINT "ai_keys_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_reservations" ADD CONSTRAINT "ai_reservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_reservations" ADD CONSTRAINT "ai_reservations_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_tenant_controls" ADD CONSTRAINT "ai_tenant_controls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_reservation_fk" FOREIGN KEY ("workspace_id","user_id","request_id") REFERENCES "public"."ai_reservations"("workspace_id","user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_user_controls" ADD CONSTRAINT "ai_user_controls_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_user_controls" ADD CONSTRAINT "ai_user_controls_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_consents_identity_idx" ON "ai_consents" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_keys_identity_mode_idx" ON "ai_keys" USING btree ("workspace_id","user_id","mode");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_keys_identity_id_idx" ON "ai_keys" USING btree ("workspace_id","user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_reservations_identity_id_idx" ON "ai_reservations" USING btree ("workspace_id","user_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_reservations_user_time_idx" ON "ai_reservations" USING btree ("workspace_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_user_controls_identity_idx" ON "ai_user_controls" USING btree ("workspace_id","user_id");
--> statement-breakpoint
-- drizzle-kit 0.22 does not serialize CHECK constraints; keep these aligned with ai-schema.ts.
ALTER TABLE ai_global_controls ADD CONSTRAINT ai_global_singleton_check CHECK(singleton);
--> statement-breakpoint
ALTER TABLE ai_user_controls ADD CONSTRAINT ai_user_limits_check CHECK(max_concurrent BETWEEN 1 AND 10 AND daily_requests BETWEEN 1 AND 10000 AND daily_tokens BETWEEN 1 AND 10000000 AND daily_spend_usd >= 0);
--> statement-breakpoint
ALTER TABLE ai_keys ADD CONSTRAINT ai_keys_shape_check CHECK(mode IN ('byok','platform') AND provider = 'openrouter' AND length(encrypted_key) > 32 AND encryption_version > 0 AND revision > 0 AND fingerprint LIKE 'sha256:%');
--> statement-breakpoint
ALTER TABLE ai_reservations ADD CONSTRAINT ai_reservations_shape_check CHECK(mode IN ('byok','platform') AND status IN ('pending','succeeded','failed','unknown') AND reserved_requests BETWEEN 1 AND 3 AND reserved_tokens >= 0 AND reserved_usd >= 0 AND (charged_tokens IS NULL OR charged_tokens >= 0) AND (charged_usd IS NULL OR charged_usd >= 0));
--> statement-breakpoint
ALTER TABLE ai_usage_ledger ADD CONSTRAINT ai_usage_shape_check CHECK(version = 1 AND mode IN ('byok','platform') AND outcome IN ('succeeded','failed','unknown') AND attempts BETWEEN 0 AND 3 AND latency_ms >= 0 AND (input_tokens IS NULL OR input_tokens >= 0) AND (output_tokens IS NULL OR output_tokens >= 0) AND (total_tokens IS NULL OR total_tokens >= 0) AND (total_tokens IS NULL OR (input_tokens IS NOT NULL AND output_tokens IS NOT NULL AND total_tokens = input_tokens + output_tokens)) AND ((cost_source = 'provider' AND cost_usd IS NOT NULL AND cost_usd >= 0) OR (cost_source = 'unavailable' AND cost_usd IS NULL)));
--> statement-breakpoint
ALTER TABLE ai_audit ADD CONSTRAINT ai_audit_shape_check CHECK(jsonb_typeof(metadata) = 'object' AND NOT (metadata ?| ARRAY['apiKey','key','prompt','output','reasoning','token']));
--> statement-breakpoint
INSERT INTO ai_global_controls(singleton) VALUES(true);
--> statement-breakpoint
CREATE FUNCTION ai_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'UPDATE' OR (EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id)
    AND EXISTS (SELECT 1 FROM users WHERE workspace_id = OLD.workspace_id AND id = OLD.user_id)) THEN
    RAISE EXCEPTION 'AI ledger and audit are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_usage_ledger_immutable BEFORE UPDATE OR DELETE ON ai_usage_ledger FOR EACH ROW EXECUTE FUNCTION ai_immutable();
--> statement-breakpoint
CREATE TRIGGER ai_audit_immutable BEFORE UPDATE OR DELETE ON ai_audit FOR EACH ROW EXECUTE FUNCTION ai_immutable();
