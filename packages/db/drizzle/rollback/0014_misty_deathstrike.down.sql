-- Issue #21 rollback: drop new Display sync tables, then display_connections.
-- Order matters: dependent tables must be dropped before display_connections.

DROP TABLE IF EXISTS display_video_snapshots;
DROP TABLE IF EXISTS display_videos;
DROP TABLE IF EXISTS display_profile_snapshots;
DROP TABLE IF EXISTS display_profiles;
DROP TABLE IF EXISTS display_sync_runs;
DROP TABLE IF EXISTS display_metric_provenance;
DROP TABLE IF EXISTS display_connections;
