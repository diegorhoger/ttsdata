-- Do not silently destroy credentials from adapters unsupported by the old key identity.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM ai_keys WHERE provider <> 'openrouter') THEN
    RAISE EXCEPTION 'Remove unsupported provider credentials before rolling back AI dispatch authorization';
  END IF;
END $$;
DROP TABLE IF EXISTS ai_dispatch_leases;
ALTER TABLE ai_reservations DROP COLUMN provider;
DROP INDEX IF EXISTS ai_keys_identity_mode_idx;
CREATE UNIQUE INDEX ai_keys_identity_mode_idx ON ai_keys(workspace_id,user_id,mode);
ALTER TABLE ai_keys ALTER COLUMN provider SET DEFAULT 'openrouter';
ALTER TABLE ai_keys DROP CONSTRAINT ai_keys_shape_check;
ALTER TABLE ai_keys ADD CONSTRAINT ai_keys_shape_check CHECK(mode IN ('byok','platform') AND provider='openrouter' AND length(encrypted_key)>32 AND encryption_version>0 AND revision>0 AND fingerprint LIKE 'sha256:%');
