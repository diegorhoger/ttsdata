CREATE TABLE IF NOT EXISTS "ai_dispatch_leases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"key_id" uuid NOT NULL,
	"key_revision" integer NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS "ai_keys_identity_mode_idx";--> statement-breakpoint
ALTER TABLE "ai_keys" ALTER COLUMN "provider" DROP DEFAULT;--> statement-breakpoint
-- Existing v1 pending requests used the sole adapter; completed rows retain their recorded provider.
ALTER TABLE "ai_reservations" ADD COLUMN "provider" text;
--> statement-breakpoint
UPDATE ai_reservations r SET provider=COALESCE((SELECT l.provider FROM ai_usage_ledger l WHERE l.request_id=r.id),'openrouter');
--> statement-breakpoint
ALTER TABLE "ai_reservations" ALTER COLUMN "provider" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_dispatch_leases" ADD CONSTRAINT "ai_dispatch_leases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_dispatch_leases" ADD CONSTRAINT "ai_dispatch_actor_fk" FOREIGN KEY ("workspace_id","user_id") REFERENCES "public"."users"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_dispatch_leases" ADD CONSTRAINT "ai_dispatch_reservation_fk" FOREIGN KEY ("workspace_id","user_id","request_id") REFERENCES "public"."ai_reservations"("workspace_id","user_id","id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_dispatch_request_attempt_idx" ON "ai_dispatch_leases" USING btree ("request_id","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_keys_identity_mode_idx" ON "ai_keys" USING btree ("workspace_id","user_id","mode","provider");
--> statement-breakpoint
ALTER TABLE ai_keys DROP CONSTRAINT ai_keys_shape_check;
--> statement-breakpoint
ALTER TABLE ai_keys ADD CONSTRAINT ai_keys_shape_check CHECK(mode IN ('byok','platform') AND provider ~ '^[a-z][a-z0-9_-]{0,63}$' AND length(encrypted_key)>32 AND encryption_version>0 AND revision>0 AND fingerprint LIKE 'sha256:%');
--> statement-breakpoint
ALTER TABLE ai_dispatch_leases ADD CONSTRAINT ai_dispatch_shape_check CHECK(attempt BETWEEN 1 AND 3 AND key_revision>0 AND provider ~ '^[a-z][a-z0-9_-]{0,63}$' AND mode IN ('byok','platform'));
--> statement-breakpoint
CREATE TRIGGER ai_dispatch_leases_immutable BEFORE UPDATE OR DELETE ON ai_dispatch_leases FOR EACH ROW EXECUTE FUNCTION ai_immutable();
