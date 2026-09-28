DROP INDEX IF EXISTS "ccos_next_actions_active_generated_dedupe_idx";
DELETE FROM "ccos_next_actions" WHERE "generated_automatically" = true AND "rule_key" IS NOT NULL;
ALTER TABLE "ccos_next_actions" DROP COLUMN IF EXISTS "resolution_reason";
ALTER TABLE "ccos_next_actions" DROP COLUMN IF EXISTS "waiting_reason";
ALTER TABLE "ccos_next_actions" DROP COLUMN IF EXISTS "dedupe_key";
ALTER TABLE "ccos_next_actions" DROP COLUMN IF EXISTS "rule_key";
