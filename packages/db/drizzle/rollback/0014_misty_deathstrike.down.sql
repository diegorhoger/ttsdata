-- Issue #21 rollback: drop new Display sync tables only.
-- display_connections is not a #21 table and must not be dropped here
-- (it is handled by its own migration rollback: 0012_shiny_wendigo.down.sql)

DROP TABLE IF EXISTS display_video_snapshots CASCADE;
DROP TABLE IF EXISTS display_videos CASCADE;
DROP TABLE IF EXISTS display_profile_snapshots CASCADE;
DROP TABLE IF EXISTS display_profiles CASCADE;
DROP TABLE IF EXISTS display_sync_runs CASCADE;
DROP TABLE IF EXISTS display_metric_provenance CASCADE;
