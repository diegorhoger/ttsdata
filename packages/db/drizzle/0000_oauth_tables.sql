-- Migration: Add OAuth state and probe result tables
-- Created: 2026-09-24

CREATE TABLE IF NOT EXISTS oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash VARCHAR(64) NOT NULL,
  session_hash VARCHAR(64) NOT NULL,
  state_value VARCHAR(128) NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_states_state_hash_idx ON oauth_states(state_hash);
CREATE INDEX IF NOT EXISTS oauth_states_expired_idx ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS oauth_probe_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id_hash VARCHAR(64) NOT NULL,
  session_hash VARCHAR(64) NOT NULL,
  data JSONB NOT NULL,
  scopes VARCHAR(255) NOT NULL DEFAULT '',
  both_succeeded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_probe_results_result_id_hash_idx ON oauth_probe_results(result_id_hash);
CREATE INDEX IF NOT EXISTS oauth_probe_results_expired_idx ON oauth_probe_results(expires_at);
