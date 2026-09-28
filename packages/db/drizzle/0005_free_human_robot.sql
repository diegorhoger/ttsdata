DO $$ BEGIN
 CREATE TYPE "public"."ccos_template_type" AS ENUM('invite_first_contact', 'partnership_confirm', 'sample_confirm', 'receipt', 'publication', 'ad_auth', 'followup_performance');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_interaction_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"interaction_id" uuid NOT NULL,
	"source_type" varchar(64) NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_template_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_version_id" uuid NOT NULL,
	"interaction_id" uuid NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "ccos_template_type" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"subject" varchar(512) NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_interaction_sources" ADD CONSTRAINT "ccos_interaction_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_interaction_sources" ADD CONSTRAINT "ccos_interaction_sources_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_interaction_sources" ADD CONSTRAINT "ccos_interaction_sources_interaction_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."ccos_interactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_usage" ADD CONSTRAINT "ccos_template_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_usage" ADD CONSTRAINT "ccos_template_usage_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_usage" ADD CONSTRAINT "ccos_template_usage_template_version_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."ccos_template_versions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_usage" ADD CONSTRAINT "ccos_template_usage_interaction_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."ccos_interactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_versions" ADD CONSTRAINT "ccos_template_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_template_versions" ADD CONSTRAINT "ccos_template_versions_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_interaction_sources_workspace_interaction_idx" ON "ccos_interaction_sources" USING btree ("workspace_id","interaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_template_usage_workspace_idx" ON "ccos_template_usage" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_template_usage_template_version_idx" ON "ccos_template_usage" USING btree ("template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_template_usage_interaction_idx" ON "ccos_template_usage" USING btree ("interaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_template_versions_workspace_type_version_idx" ON "ccos_template_versions" USING btree ("workspace_id","type","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_template_versions_workspace_type_idx" ON "ccos_template_versions" USING btree ("workspace_id","type");