CREATE TABLE IF NOT EXISTS "display_metric_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"metric_name" text NOT NULL,
	"classification" text NOT NULL,
	"source_endpoint" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"sync_run_id" uuid NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_profile_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_account_hash" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"follower_count" integer,
	"following_count" integer,
	"likes_count" integer,
	"video_count" integer,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_account_hash" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"follower_count" integer,
	"following_count" integer,
	"likes_count" integer,
	"video_count" integer,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"cursor_checkpoint" text,
	"resume_after_hash" text,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_video_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_video_hash" text NOT NULL,
	"like_count" integer,
	"comment_count" integer,
	"share_count" integer,
	"view_count" integer,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "display_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_video_hash" text NOT NULL,
	"title" text,
	"video_description" text,
	"cover_image_url" text,
	"share_url" text,
	"duration" integer,
	"height" integer,
	"width" integer,
	"create_time" timestamp with time zone,
	"is_aigc" boolean,
	"embed_link" text,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_metric_provenance" ADD CONSTRAINT "display_metric_provenance_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_metric_provenance" ADD CONSTRAINT "display_metric_provenance_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_metric_provenance" ADD CONSTRAINT "display_metric_provenance_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profile_snapshots" ADD CONSTRAINT "display_profile_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profile_snapshots" ADD CONSTRAINT "display_profile_snapshots_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profile_snapshots" ADD CONSTRAINT "display_profile_snapshots_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profiles" ADD CONSTRAINT "display_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profiles" ADD CONSTRAINT "display_profiles_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_profiles" ADD CONSTRAINT "display_profiles_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_runs" ADD CONSTRAINT "display_sync_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_runs" ADD CONSTRAINT "display_sync_runs_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_sync_runs" ADD CONSTRAINT "display_sync_runs_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_video_snapshots" ADD CONSTRAINT "display_video_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_video_snapshots" ADD CONSTRAINT "display_video_snapshots_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_video_snapshots" ADD CONSTRAINT "display_video_snapshots_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_videos" ADD CONSTRAINT "display_videos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_videos" ADD CONSTRAINT "display_videos_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "display_videos" ADD CONSTRAINT "display_videos_connection_fk" FOREIGN KEY ("workspace_id","connection_id") REFERENCES "public"."display_connections"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_metric_provenance_identity_id_idx" ON "display_metric_provenance" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_profile_snapshots_identity_id_idx" ON "display_profile_snapshots" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_profile_snapshots_idempotent_idx" ON "display_profile_snapshots" USING btree ("workspace_id","connection_id","payload_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_profiles_identity_id_idx" ON "display_profiles" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_profiles_connection_idx" ON "display_profiles" USING btree ("workspace_id","connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_sync_runs_identity_id_idx" ON "display_sync_runs" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_video_snapshots_identity_id_idx" ON "display_video_snapshots" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_video_snapshots_idempotent_idx" ON "display_video_snapshots" USING btree ("workspace_id","connection_id","provider_video_hash","payload_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_videos_identity_id_idx" ON "display_videos" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "display_videos_idempotent_idx" ON "display_videos" USING btree ("workspace_id","connection_id","provider_video_hash");