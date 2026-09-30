CREATE TABLE IF NOT EXISTS "ccos_performance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"views" bigint,
	"clicks" bigint,
	"orders" bigint,
	"gmv" numeric(20,6),
	"commission" numeric(20,6),
	"conversion" numeric(12,8),
	"currency" varchar(3),
	"classifications" jsonb NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ccos_performance_snapshots_non_negative_counts" CHECK (("views" IS NULL OR "views" >= 0) AND ("clicks" IS NULL OR "clicks" >= 0) AND ("orders" IS NULL OR "orders" >= 0)),
	CONSTRAINT "ccos_performance_snapshots_non_negative_amounts" CHECK (("gmv" IS NULL OR "gmv" >= 0) AND ("commission" IS NULL OR "commission" >= 0) AND ("conversion" IS NULL OR ("conversion" >= 0 AND "conversion" <= 1))),
	CONSTRAINT "ccos_performance_snapshots_currency_required" CHECK ((("gmv" IS NULL AND "commission" IS NULL) OR "currency" ~ '^[A-Z]{3}$')),
	CONSTRAINT "ccos_performance_snapshots_classification_provenance_shape" CHECK (COALESCE((
		jsonb_typeof("classifications") = 'object'
		AND "classifications" ?& ARRAY['views','clicks','orders','gmv','commission','conversion']
		AND ("classifications" - ARRAY['views','clicks','orders','gmv','commission','conversion']) = '{}'::jsonb
		AND "provenance"->>'schemaVersion' = '1' AND length("provenance"->>'source') BETWEEN 1 AND 64
		AND jsonb_typeof("provenance"->'metrics') = 'object'
		AND ("provenance"->'metrics') ?& ARRAY['views','clicks','orders','gmv','commission','conversion']
		AND (("provenance"->'metrics') - ARRAY['views','clicks','orders','gmv','commission','conversion']) = '{}'::jsonb
		AND jsonb_typeof("provenance"->'metrics'->'views') = 'object'
		AND jsonb_typeof("provenance"->'metrics'->'clicks') = 'object'
		AND jsonb_typeof("provenance"->'metrics'->'orders') = 'object'
		AND jsonb_typeof("provenance"->'metrics'->'gmv') = 'object'
		AND jsonb_typeof("provenance"->'metrics'->'commission') = 'object'
		AND jsonb_typeof("provenance"->'metrics'->'conversion') = 'object'
		AND "provenance"->'metrics'->'views'->>'classification' = "classifications"->>'views'
		AND "provenance"->'metrics'->'clicks'->>'classification' = "classifications"->>'clicks'
		AND "provenance"->'metrics'->'orders'->>'classification' = "classifications"->>'orders'
		AND "provenance"->'metrics'->'gmv'->>'classification' = "classifications"->>'gmv'
		AND "provenance"->'metrics'->'commission'->>'classification' = "classifications"->>'commission'
		AND "provenance"->'metrics'->'conversion'->>'classification' = "classifications"->>'conversion'
		AND "provenance"->'metrics'->'views'->>'source' = "provenance"->>'source'
		AND "provenance"->'metrics'->'clicks'->>'source' = "provenance"->>'source'
		AND "provenance"->'metrics'->'orders'->>'source' = "provenance"->>'source'
		AND "provenance"->'metrics'->'gmv'->>'source' = "provenance"->>'source'
		AND "provenance"->'metrics'->'commission'->>'source' = "provenance"->>'source'
		AND "provenance"->'metrics'->'conversion'->>'source' = "provenance"->>'source'
		AND ("provenance"->'metrics'->'views') ? 'provenance'
		AND ("provenance"->'metrics'->'clicks') ? 'provenance'
		AND ("provenance"->'metrics'->'orders') ? 'provenance'
		AND ("provenance"->'metrics'->'gmv') ? 'provenance'
		AND ("provenance"->'metrics'->'commission') ? 'provenance'
		AND ("provenance"->'metrics'->'conversion') ? 'provenance'
		AND "classifications"->>'views' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND "classifications"->>'clicks' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND "classifications"->>'orders' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND "classifications"->>'gmv' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND "classifications"->>'commission' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND "classifications"->>'conversion' IN ('observed','calculated','inferred','self-reported','unavailable')
		AND (("views" IS NULL) = ("classifications"->>'views' = 'unavailable'))
		AND (("clicks" IS NULL) = ("classifications"->>'clicks' = 'unavailable'))
		AND (("orders" IS NULL) = ("classifications"->>'orders' = 'unavailable'))
		AND (("gmv" IS NULL) = ("classifications"->>'gmv' = 'unavailable'))
		AND (("commission" IS NULL) = ("classifications"->>'commission' = 'unavailable'))
		AND (("conversion" IS NULL) = ("classifications"->>'conversion' = 'unavailable'))
	), FALSE))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_performance_snapshots_content_time_idx" ON "ccos_performance_snapshots" USING btree ("workspace_id","content_id","observed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccos_performance_snapshots_workspace_time_idx" ON "ccos_performance_snapshots" USING btree ("workspace_id","observed_at");
--> statement-breakpoint
ALTER TABLE "ccos_performance_snapshots" ADD CONSTRAINT "ccos_performance_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ccos_performance_snapshots" ADD CONSTRAINT "ccos_performance_snapshots_workspace_content_fk" FOREIGN KEY ("workspace_id","content_id") REFERENCES "public"."ccos_contents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
