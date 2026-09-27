-- Emergency rollback for CCOS foundation migration 0002_worried_lyja.
-- Destructive: back up/export CCOS data before running in any persistent environment.

DROP TABLE IF EXISTS "ccos_metric_snapshots";
DROP TABLE IF EXISTS "ccos_next_actions";
DROP TABLE IF EXISTS "ccos_interactions";
DROP TABLE IF EXISTS "ccos_contents";
DROP TABLE IF EXISTS "ccos_products";
DROP TABLE IF EXISTS "ccos_partnerships";
DROP TABLE IF EXISTS "ccos_stores";

DROP INDEX IF EXISTS "users_workspace_id_id_idx";

DROP TYPE IF EXISTS "ccos_content_status";
DROP TYPE IF EXISTS "ccos_interaction_direction";
DROP TYPE IF EXISTS "ccos_next_action_status";
DROP TYPE IF EXISTS "ccos_partnership_status";
DROP TYPE IF EXISTS "ccos_partnership_type";
DROP TYPE IF EXISTS "ccos_priority";
DROP TYPE IF EXISTS "ccos_product_status";
