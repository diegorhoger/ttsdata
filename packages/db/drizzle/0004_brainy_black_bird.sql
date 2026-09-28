ALTER TABLE "ccos_next_actions" ADD COLUMN "rule_key" varchar(128);--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "dedupe_key" varchar(255);--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "waiting_reason" text;--> statement-breakpoint
ALTER TABLE "ccos_next_actions" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ccos_next_actions_active_generated_dedupe_idx" ON "ccos_next_actions" USING btree ("workspace_id","dedupe_key") WHERE "ccos_next_actions"."generated_automatically" = true AND "ccos_next_actions"."status" IN ('open', 'in_progress', 'waiting');
--> statement-breakpoint
INSERT INTO "ccos_next_actions"
  ("workspace_id", "partnership_id", "title", "rule_key", "dedupe_key", "waiting_reason", "status", "priority", "generated_automatically")
SELECT p.workspace_id, p.id,
  CASE p.status WHEN 'lead' THEN 'Contact the store' WHEN 'contacted' THEN 'Follow up with the store'
    WHEN 'negotiating' THEN 'Confirm partnership terms' WHEN 'active' THEN 'Manage active partnership'
    WHEN 'waiting' THEN 'Waiting for partnership response' ELSE 'Partnership paused' END,
  CASE p.status WHEN 'lead' THEN 'partnership.lead.contact' WHEN 'contacted' THEN 'partnership.contacted.follow-up'
    WHEN 'negotiating' THEN 'partnership.negotiating.confirm-terms' WHEN 'active' THEN 'partnership.active.manage'
    WHEN 'waiting' THEN 'partnership.waiting.external-response' ELSE 'partnership.paused.manual-resume' END,
  (CASE p.status WHEN 'lead' THEN 'partnership.lead.contact' WHEN 'contacted' THEN 'partnership.contacted.follow-up'
    WHEN 'negotiating' THEN 'partnership.negotiating.confirm-terms' WHEN 'active' THEN 'partnership.active.manage'
    WHEN 'waiting' THEN 'partnership.waiting.external-response' ELSE 'partnership.paused.manual-resume' END)
    || ':partnership:' || p.id::text,
  CASE p.status WHEN 'waiting' THEN 'Progress depends on an external response; resume when new information arrives.'
    WHEN 'paused' THEN 'Work is intentionally paused and requires an explicit resume decision.' END,
  CASE WHEN p.status IN ('waiting','paused') THEN 'waiting'::ccos_next_action_status ELSE 'open'::ccos_next_action_status END,
  CASE WHEN p.status IN ('lead','negotiating') THEN 'high'::ccos_priority
    WHEN p.status IN ('waiting','paused') THEN 'low'::ccos_priority ELSE 'normal'::ccos_priority END, true
FROM ccos_partnerships p WHERE p.status NOT IN ('completed','declined','cancelled')
ON CONFLICT (workspace_id, dedupe_key) WHERE generated_automatically = true AND status IN ('open','in_progress','waiting') DO NOTHING;
--> statement-breakpoint
INSERT INTO "ccos_next_actions"
  ("workspace_id", "product_id", "title", "rule_key", "dedupe_key", "waiting_reason", "status", "priority", "generated_automatically")
SELECT p.workspace_id, p.id,
  CASE p.status WHEN 'proposed' THEN 'Evaluate product proposal' WHEN 'selected' THEN 'Request a sample'
    WHEN 'sample_requested' THEN 'Track sample approval' WHEN 'sample_approved' THEN 'Arrange shipment'
    WHEN 'shipped' THEN 'Confirm product receipt' WHEN 'received' THEN 'Plan product content'
    WHEN 'content_queue' THEN 'Start content production' WHEN 'in_production' THEN 'Complete and publish content'
    WHEN 'content_live' THEN 'Monitor live content' WHEN 'monitoring' THEN 'Review product campaign'
    WHEN 'out_of_stock' THEN 'Waiting for product availability' WHEN 'replacement_needed' THEN 'Resolve product replacement'
    ELSE 'Product work paused' END,
  'product.' || replace(p.status::text, '_', '-') || '.' || CASE p.status
    WHEN 'proposed' THEN 'evaluate' WHEN 'selected' THEN 'request-sample' WHEN 'sample_requested' THEN 'confirm'
    WHEN 'sample_approved' THEN 'track-shipment' WHEN 'shipped' THEN 'confirm-receipt'
    WHEN 'received' THEN 'plan-content' WHEN 'content_queue' THEN 'start-production'
    WHEN 'in_production' THEN 'publish-content' WHEN 'content_live' THEN 'monitor'
    WHEN 'monitoring' THEN 'review' WHEN 'out_of_stock' THEN 'restock'
    WHEN 'replacement_needed' THEN 'request' ELSE 'manual-resume' END,
  'product.' || replace(p.status::text, '_', '-') || '.' || CASE p.status
    WHEN 'proposed' THEN 'evaluate' WHEN 'selected' THEN 'request-sample' WHEN 'sample_requested' THEN 'confirm'
    WHEN 'sample_approved' THEN 'track-shipment' WHEN 'shipped' THEN 'confirm-receipt'
    WHEN 'received' THEN 'plan-content' WHEN 'content_queue' THEN 'start-production'
    WHEN 'in_production' THEN 'publish-content' WHEN 'content_live' THEN 'monitor'
    WHEN 'monitoring' THEN 'review' WHEN 'out_of_stock' THEN 'restock'
    WHEN 'replacement_needed' THEN 'request' ELSE 'manual-resume' END || ':product:' || p.id::text,
  CASE p.status WHEN 'out_of_stock' THEN 'The product is unavailable; resume when it is back in stock or cancel it.'
    WHEN 'paused' THEN 'Work is intentionally paused and requires an explicit resume decision.' END,
  CASE WHEN p.status IN ('out_of_stock','paused') THEN 'waiting'::ccos_next_action_status ELSE 'open'::ccos_next_action_status END,
  CASE WHEN p.status IN ('selected','sample_approved','shipped','in_production','replacement_needed') THEN 'high'::ccos_priority
    WHEN p.status IN ('monitoring','out_of_stock','paused') THEN 'low'::ccos_priority ELSE 'normal'::ccos_priority END, true
FROM ccos_products p WHERE p.status NOT IN ('completed','declined','cancelled')
ON CONFLICT (workspace_id, dedupe_key) WHERE generated_automatically = true AND status IN ('open','in_progress','waiting') DO NOTHING;
--> statement-breakpoint
INSERT INTO "ccos_next_actions"
  ("workspace_id", "content_id", "title", "rule_key", "dedupe_key", "status", "priority", "generated_automatically")
SELECT c.workspace_id, c.id,
  CASE c.status WHEN 'idea' THEN 'Plan content' WHEN 'planned' THEN 'Film content' WHEN 'filming' THEN 'Edit content'
    WHEN 'editing' THEN 'Finish the edit' WHEN 'ready' THEN 'Schedule content' WHEN 'scheduled' THEN 'Publish scheduled content'
    WHEN 'published' THEN 'Record authorization and monitor content' WHEN 'ads_authorized' THEN 'Monitor authorized content'
    ELSE 'Review content performance' END,
  'content.' || replace(c.status::text, '_', '-') || '.' || CASE c.status WHEN 'idea' THEN 'plan'
    WHEN 'planned' THEN 'film' WHEN 'filming' THEN 'edit' WHEN 'editing' THEN 'finish'
    WHEN 'ready' THEN 'schedule' WHEN 'scheduled' THEN 'publish' WHEN 'published' THEN 'authorize-or-monitor'
    WHEN 'ads_authorized' THEN 'monitor' ELSE 'review' END,
  'content.' || replace(c.status::text, '_', '-') || '.' || CASE c.status WHEN 'idea' THEN 'plan'
    WHEN 'planned' THEN 'film' WHEN 'filming' THEN 'edit' WHEN 'editing' THEN 'finish'
    WHEN 'ready' THEN 'schedule' WHEN 'scheduled' THEN 'publish' WHEN 'published' THEN 'authorize-or-monitor'
    WHEN 'ads_authorized' THEN 'monitor' ELSE 'review' END || ':content:' || c.id::text,
  'open'::ccos_next_action_status,
  CASE WHEN c.status IN ('ready','scheduled') THEN 'high'::ccos_priority
    WHEN c.status = 'monitoring' THEN 'low'::ccos_priority ELSE 'normal'::ccos_priority END, true
FROM ccos_contents c
ON CONFLICT (workspace_id, dedupe_key) WHERE generated_automatically = true AND status IN ('open','in_progress','waiting') DO NOTHING;
