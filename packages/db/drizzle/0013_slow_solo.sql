ALTER TABLE "oauth_states" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "display_connections" ADD COLUMN "remote_revocation" text DEFAULT 'not_attempted' NOT NULL;--> statement-breakpoint
ALTER TABLE "display_connections" ADD COLUMN "remote_revocation_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
-- drizzle-kit 0.22 does not serialize CHECK constraints; keep aligned with display-schema.ts.
ALTER TABLE display_connections DROP CONSTRAINT IF EXISTS display_connections_shape_check;
--> statement-breakpoint
ALTER TABLE display_connections ADD CONSTRAINT display_connections_shape_check CHECK(
  provider = 'tiktok_display'
  AND status IN ('active','expired','revoked','disconnected')
  AND remote_revocation IN ('confirmed','unavailable','not_attempted')
  AND ((remote_revocation = 'not_attempted') = (remote_revocation_at IS NULL))
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
