-- Issue #20 rollback: remove the Display capability surface.
-- Refuse to silently destroy live authorization state.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM display_connections WHERE status = 'active') THEN
    RAISE EXCEPTION 'Disconnect active Display connections before rolling back the Display lifecycle';
  END IF;
END $$;
DROP TABLE IF EXISTS display_rate_limits;
DROP TABLE IF EXISTS display_audit;
DROP TABLE IF EXISTS display_probe_evidence;
DROP TABLE IF EXISTS display_sync_jobs;
DROP TABLE IF EXISTS display_connections;
DROP TABLE IF EXISTS display_capability_controls;
