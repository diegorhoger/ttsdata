-- Issue #20 repair rollback: revert tenant-bound OAuth state and the
-- truthful remote-revocation columns.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM display_connections WHERE remote_revocation <> 'not_attempted') THEN
    RAISE EXCEPTION 'Remote revocation outcomes exist; refusing to drop the truthful-revocation columns';
  END IF;
END $$;
ALTER TABLE display_connections DROP CONSTRAINT IF EXISTS display_connections_shape_check;
ALTER TABLE display_connections ADD CONSTRAINT display_connections_shape_check CHECK(
  provider = 'tiktok_display'
  AND status IN ('active','expired','revoked','disconnected')
  AND revision > 0
  AND provider_account_hash ~ '^[a-f0-9]{64}$'
  AND access_token_encrypted ~ '^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'
  AND refresh_token_encrypted ~ '^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$'
  AND length(access_token_encrypted) > 32 AND length(refresh_token_encrypted) > 32
  AND access_token_version > 0 AND refresh_token_version > 0
  AND access_token_fingerprint LIKE 'sha256:%' AND refresh_token_fingerprint LIKE 'sha256:%'
  AND jsonb_typeof(scopes) = 'array'
  AND expires_at > authorized_at
);
ALTER TABLE display_connections DROP COLUMN IF EXISTS remote_revocation_at;
ALTER TABLE display_connections DROP COLUMN IF EXISTS remote_revocation;
ALTER TABLE oauth_states DROP CONSTRAINT IF EXISTS oauth_states_user_id_users_id_fk;
ALTER TABLE oauth_states DROP CONSTRAINT IF EXISTS oauth_states_workspace_id_workspaces_id_fk;
ALTER TABLE oauth_states DROP COLUMN IF EXISTS user_id;
ALTER TABLE oauth_states DROP COLUMN IF EXISTS workspace_id;
