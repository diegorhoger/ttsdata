DO $$ BEGIN
 CREATE TYPE "public"."ccos_content_status" AS ENUM('idea', 'planned', 'filming', 'editing', 'ready', 'scheduled', 'published', 'ads_authorized', 'monitoring');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_interaction_direction" AS ENUM('inbound', 'outbound', 'system');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_next_action_status" AS ENUM('open', 'in_progress', 'waiting', 'completed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_partnership_status" AS ENUM('lead', 'contacted', 'negotiating', 'active', 'waiting', 'paused', 'completed', 'declined', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_partnership_type" AS ENUM('inbound_invite', 'outbound_prospecting', 'affiliate', 'paid_campaign', 'gifting');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_priority" AS ENUM('low', 'normal', 'high', 'urgent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."ccos_product_status" AS ENUM('proposed', 'selected', 'sample_requested', 'sample_approved', 'shipped', 'received', 'content_queue', 'in_production', 'content_live', 'monitoring', 'declined', 'cancelled', 'out_of_stock', 'replacement_needed', 'paused', 'completed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"status" "ccos_content_status" DEFAULT 'idea' NOT NULL,
	"platform" varchar(64) NOT NULL,
	"format" varchar(64),
	"concept" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"publication_url" varchar(2048),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"partnership_id" uuid NOT NULL,
	"direction" "ccos_interaction_direction" NOT NULL,
	"channel" varchar(64) NOT NULL,
	"summary" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"store_id" uuid,
	"partnership_id" uuid,
	"product_id" uuid,
	"content_id" uuid,
	"interaction_id" uuid,
	"metric_key" varchar(128) NOT NULL,
	"numeric_value" numeric(20, 6),
	"text_value" text,
	"unit" varchar(32),
	"classification" "metric_classification" NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" varchar(64) NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_next_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"store_id" uuid,
	"partnership_id" uuid,
	"product_id" uuid,
	"content_id" uuid,
	"interaction_id" uuid,
	"title" varchar(255) NOT NULL,
	"status" "ccos_next_action_status" DEFAULT 'open' NOT NULL,
	"priority" "ccos_priority" DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"owner_user_id" uuid,
	"generated_automatically" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_partnerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"type" "ccos_partnership_type" NOT NULL,
	"status" "ccos_partnership_status" DEFAULT 'lead' NOT NULL,
	"title" varchar(255),
	"terms" text,
	"priority" "ccos_priority" DEFAULT 'normal' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"partnership_id" uuid NOT NULL,
	"name" varchar(512) NOT NULL,
	"sku" varchar(128),
	"product_url" varchar(2048),
	"status" "ccos_product_status" DEFAULT 'proposed' NOT NULL,
	"tracking_code" varchar(255),
	"shipped_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"priority" "ccos_priority" DEFAULT 'normal' NOT NULL,
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"provenance" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"contact_name" varchar(255),
	"contact_email" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_contents_workspace_id_id_idx" ON "ccos_contents" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_interactions_workspace_id_id_idx" ON "ccos_interactions" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_partnerships_workspace_id_id_idx" ON "ccos_partnerships" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_products_workspace_id_id_idx" ON "ccos_products" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_stores_workspace_id_id_idx" ON "ccos_stores" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_workspace_id_id_idx" ON "users" USING btree ("workspace_id","id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_exactly_one_target"
 CHECK (num_nonnulls("store_id", "partnership_id", "product_id", "content_id", "interaction_id") = 1);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_exactly_one_target"
 CHECK (num_nonnulls("store_id", "partnership_id", "product_id", "content_id", "interaction_id") = 1);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_contents" ADD CONSTRAINT "ccos_contents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_contents" ADD CONSTRAINT "ccos_contents_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."ccos_products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_interactions" ADD CONSTRAINT "ccos_interactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_interactions" ADD CONSTRAINT "ccos_interactions_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_store_fk" FOREIGN KEY ("workspace_id","store_id") REFERENCES "public"."ccos_stores"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."ccos_products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_content_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."ccos_contents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_metric_snapshots" ADD CONSTRAINT "ccos_metric_snapshots_workspace_interaction_fk" FOREIGN KEY ("workspace_id","interaction_id") REFERENCES "public"."ccos_interactions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_owner_fk" FOREIGN KEY ("workspace_id","owner_user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_store_fk" FOREIGN KEY ("workspace_id","store_id") REFERENCES "public"."ccos_stores"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."ccos_products"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_content_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."ccos_contents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_next_actions" ADD CONSTRAINT "ccos_next_actions_workspace_interaction_fk" FOREIGN KEY ("workspace_id","interaction_id") REFERENCES "public"."ccos_interactions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_partnerships" ADD CONSTRAINT "ccos_partnerships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_partnerships" ADD CONSTRAINT "ccos_partnerships_workspace_store_fk" FOREIGN KEY ("workspace_id","store_id") REFERENCES "public"."ccos_stores"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_products" ADD CONSTRAINT "ccos_products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_products" ADD CONSTRAINT "ccos_products_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_stores" ADD CONSTRAINT "ccos_stores_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_contents_workspace_product_idx" ON "ccos_contents" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_interactions_workspace_partnership_idx" ON "ccos_interactions" USING btree ("workspace_id","partnership_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_metric_snapshots_metric_time_idx" ON "ccos_metric_snapshots" USING btree ("workspace_id","metric_key","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_next_actions_workspace_status_due_idx" ON "ccos_next_actions" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_partnerships_workspace_store_idx" ON "ccos_partnerships" USING btree ("workspace_id","store_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_products_workspace_partnership_idx" ON "ccos_products" USING btree ("workspace_id","partnership_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_stores_workspace_name_idx" ON "ccos_stores" USING btree ("workspace_id","name");
