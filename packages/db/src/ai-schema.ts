import { pgTable, uuid, text, integer, bigint, timestamp, boolean, jsonb, decimal, uniqueIndex, index, foreignKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, workspaces } from './schema';
const workspace = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });
const date = (name: string) => timestamp(name, { withTimezone: true });
const amount = (name: string) => decimal(name, { precision: 20, scale: 12 });
const count = (name: string) => bigint(name, { mode: 'number' });
const actor = (name: string, t: { workspaceId: any; userId: any }) => foreignKey({ name, columns: [t.workspaceId, t.userId], foreignColumns: [users.workspaceId, users.id] }).onDelete('cascade');
export const aiGlobalControls = pgTable('ai_global_controls', { singleton: boolean('singleton').primaryKey().default(true), enabled: boolean('enabled').notNull().default(false) }, (t) => ({ shape: check('ai_global_singleton_check', sql`${t.singleton}`) }));
export const aiTenantControls = pgTable('ai_tenant_controls', { workspaceId: workspace().primaryKey(), enabled: boolean('enabled').notNull().default(false) });
export const aiUserControls = pgTable('ai_user_controls', {
  workspaceId: workspace(), userId: uuid('user_id').notNull(), enabled: boolean('enabled').notNull().default(false), platformEnabled: boolean('platform_enabled').notNull().default(false),
  maxConcurrent: integer('max_concurrent').notNull().default(2), dailyRequests: integer('daily_requests').notNull().default(30), dailyTokens: count('daily_tokens').notNull().default(100000), dailySpendUsd: amount('daily_spend_usd').notNull().default('1'),
}, (t) => ({ identity: uniqueIndex('ai_user_controls_identity_idx').on(t.workspaceId, t.userId), actor: actor('ai_user_controls_actor_fk', t),
  limits: check('ai_user_limits_check', sql`${t.maxConcurrent} BETWEEN 1 AND 10 AND ${t.dailyRequests} BETWEEN 1 AND 10000 AND ${t.dailyTokens} BETWEEN 1 AND 10000000 AND ${t.dailySpendUsd} >= 0`) }));
export const aiKeys = pgTable('ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: workspace(), userId: uuid('user_id').notNull(), mode: text('mode').notNull(), provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(), encryptionVersion: integer('encryption_version').notNull(), fingerprint: text('fingerprint').notNull(), enabled: boolean('enabled').notNull().default(true), revision: integer('revision').notNull().default(1),
  validatedAt: date('validated_at'), expiresAt: date('expires_at'), createdAt: date('created_at').notNull().defaultNow(), updatedAt: date('updated_at').notNull().defaultNow(),
}, (t) => ({ identityMode: uniqueIndex('ai_keys_identity_mode_idx').on(t.workspaceId, t.userId, t.mode, t.provider), identityId: uniqueIndex('ai_keys_identity_id_idx').on(t.workspaceId, t.userId, t.id), actor: actor('ai_keys_actor_fk', t),
  shape: check('ai_keys_shape_check', sql`${t.mode} IN ('byok','platform') AND ${t.provider} ~ '^[a-z][a-z0-9_-]{0,63}$' AND length(${t.encryptedKey}) > 32 AND ${t.encryptionVersion} > 0 AND ${t.revision} > 0 AND ${t.fingerprint} LIKE 'sha256:%'`) }));
export const aiConsents = pgTable('ai_consents', {
  workspaceId: workspace(), userId: uuid('user_id').notNull(), version: text('version').notNull(), requireZdr: boolean('require_zdr').notNull().default(true), acceptedAt: date('accepted_at').notNull().defaultNow(),
}, (t) => ({ identity: uniqueIndex('ai_consents_identity_idx').on(t.workspaceId, t.userId), actor: actor('ai_consents_actor_fk', t) }));
export const aiReservations = pgTable('ai_reservations', {
  id: uuid('id').primaryKey(), workspaceId: workspace(), userId: uuid('user_id').notNull(), mode: text('mode').notNull(), provider: text('provider').notNull(), model: text('model').notNull(), status: text('status').notNull().default('pending'),
  reservedRequests: integer('reserved_requests').notNull(), reservedTokens: count('reserved_tokens').notNull(), reservedUsd: amount('reserved_usd').notNull(), chargedTokens: count('charged_tokens'), chargedUsd: amount('charged_usd'),
  expiresAt: date('expires_at').notNull(), createdAt: date('created_at').notNull().defaultNow(),
}, (t) => ({ identityId: uniqueIndex('ai_reservations_identity_id_idx').on(t.workspaceId, t.userId, t.id), userTime: index('ai_reservations_user_time_idx').on(t.workspaceId, t.userId, t.createdAt), actor: actor('ai_reservations_actor_fk', t),
  shape: check('ai_reservations_shape_check', sql`${t.mode} IN ('byok','platform') AND ${t.status} IN ('pending','succeeded','failed','unknown') AND ${t.reservedRequests} BETWEEN 1 AND 3 AND ${t.reservedTokens} >= 0 AND ${t.reservedUsd} >= 0 AND (${t.chargedTokens} IS NULL OR ${t.chargedTokens} >= 0) AND (${t.chargedUsd} IS NULL OR ${t.chargedUsd} >= 0)`) }));
export const aiUsageLedger = pgTable('ai_usage_ledger', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: workspace(), userId: uuid('user_id').notNull(), requestId: uuid('request_id').notNull().unique(), version: integer('version').notNull().default(1), mode: text('mode').notNull(), provider: text('provider').notNull(),
  selectedModel: text('selected_model').notNull(), resolvedModel: text('resolved_model'), resolvedProvider: text('resolved_provider'), providerRequestId: text('provider_request_id'), promptVersion: text('prompt_version').notNull(), schemaVersion: text('schema_version').notNull(),
  outcome: text('outcome').notNull(), errorCode: text('error_code'), attempts: integer('attempts').notNull(), inputTokens: count('input_tokens'), outputTokens: count('output_tokens'), totalTokens: count('total_tokens'), costUsd: amount('cost_usd'), costSource: text('cost_source').notNull(),
  finishReason: text('finish_reason'), latencyMs: integer('latency_ms').notNull(), createdAt: date('created_at').notNull().defaultNow(),
}, (t) => ({ actor: actor('ai_usage_ledger_actor_fk', t), reservation: foreignKey({ name: 'ai_usage_ledger_reservation_fk', columns: [t.workspaceId, t.userId, t.requestId], foreignColumns: [aiReservations.workspaceId, aiReservations.userId, aiReservations.id] }).onDelete('cascade'),
  shape: check('ai_usage_shape_check', sql`${t.version} = 1 AND ${t.mode} IN ('byok','platform') AND ${t.outcome} IN ('succeeded','failed','unknown') AND ${t.attempts} BETWEEN 0 AND 3 AND ${t.latencyMs} >= 0 AND (${t.inputTokens} IS NULL OR ${t.inputTokens} >= 0) AND (${t.outputTokens} IS NULL OR ${t.outputTokens} >= 0) AND (${t.totalTokens} IS NULL OR ${t.totalTokens} >= 0) AND (${t.totalTokens} IS NULL OR (${t.inputTokens} IS NOT NULL AND ${t.outputTokens} IS NOT NULL AND ${t.totalTokens} = ${t.inputTokens} + ${t.outputTokens})) AND ((${t.costSource} = 'provider' AND ${t.costUsd} IS NOT NULL AND ${t.costUsd} >= 0) OR (${t.costSource} = 'unavailable' AND ${t.costUsd} IS NULL))`) }));
export const aiAudit = pgTable('ai_audit', {
  id: uuid('id').primaryKey().defaultRandom(), workspaceId: workspace(), userId: uuid('user_id').notNull(), action: text('action').notNull(), targetId: uuid('target_id'), metadata: jsonb('metadata').notNull().default({}), createdAt: date('created_at').notNull().defaultNow(),
}, (t) => ({ actor: actor('ai_audit_actor_fk', t), shape: check('ai_audit_shape_check', sql`jsonb_typeof(${t.metadata}) = 'object' AND NOT (${t.metadata} ?| ARRAY['apiKey','key','prompt','output','reasoning','token'])`) }));
export const aiDispatchLeases = pgTable('ai_dispatch_leases', {
  id: uuid('id').primaryKey(), workspaceId: workspace(), userId: uuid('user_id').notNull(), requestId: uuid('request_id').notNull(),
  attempt: integer('attempt').notNull(), provider: text('provider').notNull(), mode: text('mode').notNull(), keyId: uuid('key_id').notNull(),
  keyRevision: integer('key_revision').notNull(), authorizedAt: date('authorized_at').notNull().defaultNow(),
}, (t) => ({ attemptUnique: uniqueIndex('ai_dispatch_request_attempt_idx').on(t.requestId, t.attempt), actor: actor('ai_dispatch_actor_fk', t),
  reservation: foreignKey({ name: 'ai_dispatch_reservation_fk', columns: [t.workspaceId, t.userId, t.requestId], foreignColumns: [aiReservations.workspaceId, aiReservations.userId, aiReservations.id] }).onDelete('cascade'),
  shape: check('ai_dispatch_shape_check', sql`${t.attempt} BETWEEN 1 AND 3 AND ${t.keyRevision} > 0 AND ${t.provider} ~ '^[a-z][a-z0-9_-]{0,63}$' AND ${t.mode} IN ('byok','platform')`) }));
