CREATE TABLE IF NOT EXISTS "ccos_production_queue_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"previous_order" jsonb NOT NULL,
	"new_order" jsonb NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_production_queue_state" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_production_queue_audit" ADD CONSTRAINT "ccos_production_queue_audit_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_production_queue_audit" ADD CONSTRAINT "ccos_queue_audit_workspace_actor_fk" FOREIGN KEY ("workspace_id","actor_user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_production_queue_state" ADD CONSTRAINT "ccos_production_queue_state_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_queue_audit_workspace_revision_idx" ON "ccos_production_queue_audit" USING btree ("workspace_id","revision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_products_workspace_status_id_idx" ON "ccos_products" USING btree ("workspace_id","status","id");
--> statement-breakpoint
-- drizzle-kit 0.22 omits CHECK generation; mirror the schema checks explicitly,
-- as in the preceding CCOS migrations.
ALTER TABLE "ccos_production_queue_state" ADD CONSTRAINT "ccos_queue_state_revision_check" CHECK ("revision" >= 0);
--> statement-breakpoint
ALTER TABLE "ccos_production_queue_state" ADD CONSTRAINT "ccos_queue_state_order_check" CHECK (jsonb_typeof("product_ids") = 'array');
--> statement-breakpoint
ALTER TABLE "ccos_production_queue_audit" ADD CONSTRAINT "ccos_queue_audit_shape_check" CHECK (
  "revision" > 0 AND length(trim("reason")) > 0 AND jsonb_typeof("previous_order") = 'array' AND jsonb_typeof("new_order") = 'array'
);
