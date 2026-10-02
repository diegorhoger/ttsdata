CREATE TABLE IF NOT EXISTS "display_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_capability_controls" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'tiktok_display' NOT NULL,
	"provider_account_hash" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"access_token_version" integer NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"refresh_token_version" integer NOT NULL,
	"access_token_fingerprint" text NOT NULL,
	"refresh_token_fingerprint" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"authorized_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_expires_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_probe_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid,
	"operation" text NOT NULL,
	"succeeded" boolean NOT NULL,
	"status_code" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_code" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_rate_limits" (
	"bucket_key" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "display_audit_tenant_time_idx" ON "display_audit" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_connections_identity_id_idx" ON "display_connections" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_connections_account_idx" ON "display_connections" USING btree ("workspace_id","user_id","provider","provider_account_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "display_connections_tenant_user_idx" ON "display_connections" USING btree ("workspace_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_rate_limits_identity_idx" ON "display_rate_limits" USING btree ("bucket_key","action","window_start");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_sync_jobs_identity_id_idx" ON "display_sync_jobs" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "display_sync_jobs_pending_idx" ON "display_sync_jobs" USING btree ("workspace_id","connection_id","status");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_audit" ADD CONSTRAINT "display_audit_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_audit" ADD CONSTRAINT "display_audit_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_audit" ADD CONSTRAINT "display_audit_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_connections" ADD CONSTRAINT "display_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_connections" ADD CONSTRAINT "display_connections_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_probe_evidence" ADD CONSTRAINT "display_probe_evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_probe_evidence" ADD CONSTRAINT "display_probe_evidence_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_probe_evidence" ADD CONSTRAINT "display_probe_evidence_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_jobs" ADD CONSTRAINT "display_sync_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_jobs" ADD CONSTRAINT "display_sync_jobs_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_jobs" ADD CONSTRAINT "display_sync_jobs_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- drizzle-kit 0.22 does not serialize CHECK constraints; keep these aligned with display-schema.ts.
-- Kill switch is OFF by default: the capability must be explicitly enabled.
INSERT INTO display_capability_controls(singleton, enabled) VALUES(true, false);
--> statement-breakpoint
ALTER TABLE display_capability_controls ADD CONSTRAINT display_capability_singleton_check CHECK(singleton);
--> statement-breakpoint
ALTER TABLE display_connections ADD CONSTRAINT display_connections_shape_check CHECK(
  provider = 'tiktok_display'
  AND status IN ('active','expired','revoked','disconnected')
  AND revision > 0
  AND provider_account_hash ~ '^[a-f0-9]{64}$'
  AND access_token_encrypted ~ '^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'
  AND refresh_token_encrypted ~ '^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'
  AND length(access_token_encrypted) > 32 AND length(refresh_token_encrypted) > 32
  AND access_token_version > 0 AND refresh_token_version > 0
  AND access_token_fingerprint LIKE 'sha256:%' AND refresh_token_fingerprint LIKE 'sha256:%'
  AND jsonb_typeof(scopes) = 'array'
  AND expires_at > authorized_at
);
--> statement-breakpoint
ALTER TABLE display_connections ADD CONSTRAINT display_connections_lifecycle_check CHECK(
  (status = 'active' AND revoked_at IS NULL AND disconnected_at IS NULL)
  OR (status = 'expired' AND disconnected_at IS NULL)
  OR (status = 'revoked' AND revoked_at IS NOT NULL AND disconnected_at IS NULL)
  OR (status = 'disconnected' AND disconnected_at IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE display_sync_jobs ADD CONSTRAINT display_sync_jobs_shape_check CHECK(
  kind IN ('profile_sync','video_sync')
  AND status IN ('queued','running','succeeded','failed','cancelled')
  AND attempts >= 0
  AND ((status IN ('succeeded','failed','cancelled')) = (finished_at IS NOT NULL))
  AND ((status = 'running') = (started_at IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE display_probe_evidence ADD CONSTRAINT display_probe_evidence_shape_check CHECK(
  operation IN ('user_info','video_list')
  AND (status_code IS NULL OR (status_code >= 100 AND status_code <= 599))
  AND jsonb_typeof(payload) = 'object'
  AND (payload - ARRAY['access_token','refresh_token','token','code','authorization','client_secret']) = payload
  AND COALESCE(payload->>'open_id', '<REDACTED>') = '<REDACTED>'
  AND COALESCE(payload->>'union_id', '<REDACTED>') = '<REDACTED>'
  AND COALESCE(payload->>'display_name', '<REDACTED>') = '<REDACTED>'
  AND COALESCE(payload->>'username', '<REDACTED>') = '<REDACTED>'
);
--> statement-breakpoint
ALTER TABLE display_audit ADD CONSTRAINT display_audit_shape_check CHECK(
  action IN ('authorization_start','authorization_callback','token_refresh','token_revoke','disconnect','credential_read','sync_cancel')
  AND outcome IN ('success','failure','denied')
  AND jsonb_typeof(metadata) = 'object'
  AND NOT (metadata ?| ARRAY['access_token','refresh_token','token','code','authorization','client_secret','secret'])
);
--> statement-breakpoint
ALTER TABLE display_rate_limits ADD CONSTRAINT display_rate_limits_shape_check CHECK(
  bucket_key ~ '^[a-f0-9]{64}$'
  AND action IN ('authorization_start','authorization_callback','token_refresh','token_revoke','disconnect')
  AND count >= 0
);
