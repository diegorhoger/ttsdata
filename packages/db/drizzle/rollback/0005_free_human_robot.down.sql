DROP INDEX IF EXISTS "ccos_template_versions_workspace_type_version_idx";
DROP INDEX IF EXISTS "ccos_template_versions_workspace_type_idx";
DROP INDEX IF EXISTS "ccos_template_usage_workspace_idx";
DROP INDEX IF EXISTS "ccos_template_usage_template_version_idx";
DROP INDEX IF EXISTS "ccos_template_usage_interaction_idx";
DROP INDEX IF EXISTS "ccos_interaction_sources_workspace_interaction_idx";

DROP TABLE IF EXISTS "ccos_template_usage";
DROP TABLE IF EXISTS "ccos_template_versions";
DROP TABLE IF EXISTS "ccos_interaction_sources";

DROP TYPE IF EXISTS "public"."ccos_template_type";
