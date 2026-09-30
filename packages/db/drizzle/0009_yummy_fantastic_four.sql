DO $$ BEGIN
 CREATE TYPE "public"."ccos_opportunity_state" AS ENUM('UNASSESSED', 'TESTING', 'LOW_POTENTIAL', 'PROMISING', 'WINNER', 'SCALE', 'PAUSED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_opportunity_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"partnership_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"previous_state" "ccos_opportunity_state" NOT NULL,
	"new_state" "ccos_opportunity_state" NOT NULL,
	"action_kind" varchar(32),
	"action_id" uuid,
	"reason" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"policy_version" varchar(64) DEFAULT 'manual-v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ccos_opportunity_states" (
	"partnership_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"state" "ccos_opportunity_state" DEFAULT 'UNASSESSED' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_history" ADD CONSTRAINT "ccos_opportunity_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_history" ADD CONSTRAINT "ccos_opportunity_history_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_history" ADD CONSTRAINT "ccos_opportunity_history_workspace_actor_fk" FOREIGN KEY ("workspace_id","actor_user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_next_actions_workspace_id_idx" ON "ccos_next_actions" USING btree ("workspace_id","id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_history" ADD CONSTRAINT "ccos_opportunity_history_workspace_action_fk" FOREIGN KEY ("workspace_id","action_id") REFERENCES "public"."ccos_next_actions"("workspace_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_states" ADD CONSTRAINT "ccos_opportunity_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ccos_opportunity_states" ADD CONSTRAINT "ccos_opportunity_states_workspace_partnership_fk" FOREIGN KEY ("workspace_id","partnership_id") REFERENCES "public"."ccos_partnerships"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_opportunity_history_revision_idx" ON "ccos_opportunity_history" USING btree ("workspace_id","partnership_id","revision");--> statement-breakpoint
ALTER TABLE ccos_opportunity_states ADD CONSTRAINT ccos_opportunity_states_revision_check CHECK (revision >= 0);
--> statement-breakpoint
ALTER TABLE ccos_opportunity_history ADD CONSTRAINT ccos_opportunity_history_shape_check CHECK (
 revision > 0 AND length(trim(reason)) BETWEEN 1 AND 2000
 AND jsonb_typeof(evidence) = 'object' AND evidence <> '{}'::jsonb AND length(evidence::text) <= 20000
 AND policy_version = 'manual-v1'
 AND ((action_kind IS NULL AND action_id IS NULL AND previous_state <> new_state)
 OR (action_kind IS NOT NULL AND action_kind IN ('follow_up','replenishment','additional_sku','new_creative','expansion') AND action_id IS NOT NULL AND previous_state = new_state))
);
--> statement-breakpoint
-- History is append-only. Workspace teardown remains possible via cascading deletion.
CREATE FUNCTION ccos_opportunity_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' OR EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.workspace_id) THEN
   RAISE EXCEPTION 'Opportunity history is append-only' USING ERRCODE = '23514';
 END IF;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER ccos_opportunity_history_immutable_trigger BEFORE UPDATE OR DELETE ON ccos_opportunity_history FOR EACH ROW EXECUTE FUNCTION ccos_opportunity_history_immutable();
