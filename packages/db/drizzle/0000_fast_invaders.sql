DO $$ BEGIN
 CREATE TYPE "public"."alert_trigger_type" AS ENUM('score_threshold', 'momentum', 'commission_change', 'price_change', 'saturation', 'new_content');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."connection_status" AS ENUM('active', 'expired', 'revoked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."entity_type" AS ENUM('product', 'creator', 'shop', 'video');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."metric_classification" AS ENUM('observed', 'calculated', 'inferred', 'self-reported', 'unavailable');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."plan_code" AS ENUM('free', 'creator', 'pro', 'agency');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."saturation_level" AS ENUM('low', 'moderate', 'high', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."trend_lifecycle" AS ENUM('emerging', 'growing', 'mature', 'declining', 'insufficient-data');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'analyst', 'viewer');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_rule_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"trigger_data" jsonb NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"trigger_type" "alert_trigger_type" NOT NULL,
	"conditions" jsonb NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"delivery_channels" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creators" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"marketplace" varchar(8) DEFAULT 'BR' NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"avatar_url" varchar(2048),
	"follower_count" integer,
	"affiliate_status" varchar(32),
	"classification" "metric_classification" DEFAULT 'observed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunity_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"version" varchar(8) DEFAULT 'v1' NOT NULL,
	"marketplace" varchar(8) NOT NULL,
	"category_id" varchar(64),
	"score" integer NOT NULL,
	"confidence" varchar(8) NOT NULL,
	"components" jsonb NOT NULL,
	"cohort" varchar(255) NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_creator_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"creator_id" varchar(64) NOT NULL,
	"first_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'BRL' NOT NULL,
	"commission_rate" numeric(5, 4) NOT NULL,
	"stock_signal" varchar(32),
	"rating" numeric(3, 2),
	"review_count" integer,
	"sales_volume" integer,
	"sales_velocity" numeric(12, 4),
	"classification" "metric_classification" DEFAULT 'observed' NOT NULL,
	"provenance" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "products" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"marketplace" varchar(8) DEFAULT 'BR' NOT NULL,
	"title" varchar(512) NOT NULL,
	"description" text,
	"category_id" varchar(64),
	"category_path" jsonb,
	"image_url" varchar(2048),
	"shop_id" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_observed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saturation_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"version" varchar(8) DEFAULT 'v1' NOT NULL,
	"marketplace" varchar(8) NOT NULL,
	"level" "saturation_level" NOT NULL,
	"score" integer NOT NULL,
	"factors" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(512) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shops" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"marketplace" varchar(8) DEFAULT 'BR' NOT NULL,
	"name" varchar(255) NOT NULL,
	"logo_url" varchar(2048),
	"rating" numeric(3, 2),
	"product_count" integer,
	"classification" "metric_classification" DEFAULT 'observed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tiktok_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"marketplace" varchar(8) DEFAULT 'BR' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"status" "connection_status" DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trend_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"window" varchar(8) NOT NULL,
	"growth_rate" numeric(10, 4) NOT NULL,
	"acceleration" numeric(10, 4) NOT NULL,
	"lifecycle" "trend_lifecycle" NOT NULL,
	"confidence" varchar(8) NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"role" "user_role" DEFAULT 'owner' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videos" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"product_id" varchar(64) NOT NULL,
	"creator_id" varchar(64) NOT NULL,
	"title" varchar(512),
	"thumbnail_url" varchar(2048),
	"duration" integer,
	"like_count" integer,
	"share_count" integer,
	"view_count" integer,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" varchar(64) NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"plan_code" "plan_code" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_alert_rule_id_alert_rules_id_fk" FOREIGN KEY ("alert_rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_creator_links" ADD CONSTRAINT "product_creator_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_creator_links" ADD CONSTRAINT "product_creator_links_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_snapshots" ADD CONSTRAINT "product_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "saturation_scores" ADD CONSTRAINT "saturation_scores_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tiktok_connections" ADD CONSTRAINT "tiktok_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_signals" ADD CONSTRAINT "trend_signals_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videos" ADD CONSTRAINT "videos_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "os_product_version_idx" ON "opportunity_scores" USING btree ("product_id","version","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pcl_product_creator_idx" ON "product_creator_links" USING btree ("product_id","creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "snapshots_product_time_idx" ON "product_snapshots" USING btree ("product_id","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_marketplace_idx" ON "products" USING btree ("marketplace");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_shop_idx" ON "products" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ss_product_version_idx" ON "saturation_scores" USING btree ("product_id","version","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ts_product_window_idx" ON "trend_signals" USING btree ("product_id","window","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_product_idx" ON "videos" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videos_creator_idx" ON "videos" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wli_watchlist_entity_idx" ON "watchlist_items" USING btree ("watchlist_id","entity_type","entity_id");