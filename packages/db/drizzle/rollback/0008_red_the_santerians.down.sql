-- Deletes production-queue ordering and audit records only. Export before deployment rollback.
DROP TABLE IF EXISTS "ccos_production_queue_audit";
DROP TABLE IF EXISTS "ccos_production_queue_state";
DROP INDEX IF EXISTS "ccos_products_workspace_status_id_idx";
