import {
  pgTable, uuid, text, integer, timestamp, boolean, jsonb, uniqueIndex, index, foreignKey, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users, workspaces } from './schema';

/**
 * Issue #20 — Durable TikTok Display API authorization lifecycle.
 *
 * Provider-neutral connection storage for the Display capability family only.
 * Credentials are stored as versioned AES-256-GCM ciphertext (`iv.tag.ciphertext`,
 * base64); the shape check makes a plaintext credential unrepresentable.
 *
 * Tenant isolation is enforced structurally: every child table carries
 * workspace_id and joins through composite (workspace_id, ...) foreign keys, so a
 * cross-tenant reference cannot be inserted even by a buggy query.
 */

const workspace = () => uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' });
const date = (name: string) => timestamp(name, { withTimezone: true });
const actor = (name: string, t: { workspaceId: any; userId: any }) =>
  foreignKey({ name, columns: [t.workspaceId, t.userId], foreignColumns: [users.workspaceId, users.id] }).onDelete('cascade');

/** Deployment-level kill switch for the whole Display capability family. */
export const displayCapabilityControls = pgTable('display_capability_controls', {
  singleton: boolean('singleton').primaryKey().default(true),
  enabled: boolean('enabled').notNull().default(false),
  reason: text('reason'),
  updatedAt: date('updated_at').notNull().defaultNow(),
}, (t) => ({
  shape: check('display_capability_singleton_check', sql`${t.singleton}`),
}));

export const displayConnections = pgTable('display_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspace(),
  userId: uuid('user_id').notNull(),
  provider: text('provider').notNull().default('tiktok_display'),
  /** sha256 of the provider account identifier. The raw identifier is never persisted. */
  providerAccountHash: text('provider_account_hash').notNull(),

  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  accessTokenVersion: integer('access_token_version').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  refreshTokenVersion: integer('refresh_token_version').notNull(),
  accessTokenFingerprint: text('access_token_fingerprint').notNull(),
  refreshTokenFingerprint: text('refresh_token_fingerprint').notNull(),

  scopes: jsonb('scopes').$type<string[]>().notNull(),
  status: text('status').notNull().default('active'),
  revision: integer('revision').notNull().default(1),

  authorizedAt: date('authorized_at').notNull(),
  expiresAt: date('expires_at').notNull(),
  refreshExpiresAt: date('refresh_expires_at'),
  lastRefreshedAt: date('last_refreshed_at'),
  lastSyncAt: date('last_sync_at'),
  revokedAt: date('revoked_at'),
  disconnectedAt: date('disconnected_at'),
  /** Truthful provider outcome: 'confirmed' only when TikTok confirmed it. */
  remoteRevocation: text('remote_revocation').notNull().default('not_attempted'),
  remoteRevocationAt: date('remote_revocation_at'),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
}, (t) => ({
  identityId: uniqueIndex('display_connections_identity_id_idx').on(t.workspaceId, t.id),
  account: uniqueIndex('display_connections_account_idx').on(t.workspaceId, t.userId, t.provider, t.providerAccountHash),
  tenantUser: index('display_connections_tenant_user_idx').on(t.workspaceId, t.userId),
  actor: actor('display_connections_actor_fk', t),
  shape: check('display_connections_shape_check', sql`
    ${t.provider} = 'tiktok_display'
    AND ${t.status} IN ('active','expired','revoked','disconnected')
    AND ${t.remoteRevocation} IN ('confirmed','unavailable','not_attempted')
    AND ((${t.remoteRevocation} = 'not_attempted') = (${t.remoteRevocationAt} IS NULL))
    AND ${t.revision} > 0
    AND ${t.providerAccountHash} ~ '^[a-f0-9]{64}$'
    AND ${t.accessTokenEncrypted} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$'
    AND ${t.refreshTokenEncrypted} ~ '^[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+\\.[A-Za-z0-9+/=]+$'
    AND length(${t.accessTokenEncrypted}) > 32 AND length(${t.refreshTokenEncrypted}) > 32
    AND ${t.accessTokenVersion} > 0 AND ${t.refreshTokenVersion} > 0
    AND ${t.accessTokenFingerprint} LIKE 'sha256:%' AND ${t.refreshTokenFingerprint} LIKE 'sha256:%'
    AND jsonb_typeof(${t.scopes}) = 'array'
    AND ${t.expiresAt} > ${t.authorizedAt}
  `),
  lifecycle: check('display_connections_lifecycle_check', sql`
    (${t.status} = 'active' AND ${t.revokedAt} IS NULL AND ${t.disconnectedAt} IS NULL)
    OR (${t.status} = 'expired' AND ${t.disconnectedAt} IS NULL)
    OR (${t.status} = 'revoked' AND ${t.revokedAt} IS NOT NULL AND ${t.disconnectedAt} IS NULL)
    OR (${t.status} = 'disconnected' AND ${t.disconnectedAt} IS NOT NULL)
  `),
}));

/** Durable queued work, so disconnect cancellation is a real state transition. */
export const displaySyncJobs = pgTable('display_sync_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspace(),
  userId: uuid('user_id').notNull(),
  connectionId: uuid('connection_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  scheduledAt: date('scheduled_at').notNull().defaultNow(),
  startedAt: date('started_at'),
  finishedAt: date('finished_at'),
  errorCode: text('error_code'),
  createdAt: date('created_at').notNull().defaultNow(),
  updatedAt: date('updated_at').notNull().defaultNow(),
}, (t) => ({
  identityId: uniqueIndex('display_sync_jobs_identity_id_idx').on(t.workspaceId, t.id),
  pending: index('display_sync_jobs_pending_idx').on(t.workspaceId, t.connectionId, t.status),
  actor: actor('display_sync_jobs_actor_fk', t),
  connection: foreignKey({
    name: 'display_sync_jobs_connection_fk',
    columns: [t.workspaceId, t.connectionId],
    foreignColumns: [displayConnections.workspaceId, displayConnections.id],
  }).onDelete('cascade'),
  shape: check('display_sync_jobs_shape_check', sql`
    ${t.kind} IN ('profile_sync','video_sync')
    AND ${t.status} IN ('queued','running','succeeded','failed','cancelled')
    AND ${t.attempts} >= 0
    AND ((${t.status} IN ('succeeded','failed','cancelled')) = (${t.finishedAt} IS NOT NULL))
    AND ((${t.status} = 'running') = (${t.startedAt} IS NOT NULL))
  `),
}));

/** Sanitized Display API probe evidence. Never stores tokens, codes or account identifiers. */
export const displayProbeEvidence = pgTable('display_probe_evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspace(),
  userId: uuid('user_id').notNull(),
  connectionId: uuid('connection_id'),
  operation: text('operation').notNull(),
  succeeded: boolean('succeeded').notNull(),
  statusCode: integer('status_code'),
  payload: jsonb('payload').notNull().default({}),
  errorCode: text('error_code'),
  observedAt: date('observed_at').notNull().defaultNow(),
  createdAt: date('created_at').notNull().defaultNow(),
}, (t) => ({
  actor: actor('display_probe_evidence_actor_fk', t),
  connection: foreignKey({
    name: 'display_probe_evidence_connection_fk',
    columns: [t.workspaceId, t.connectionId],
    foreignColumns: [displayConnections.workspaceId, displayConnections.id],
  }).onDelete('cascade'),
  shape: check('display_probe_evidence_shape_check', sql`
    ${t.operation} IN ('user_info','video_list')
    AND (${t.statusCode} IS NULL OR (${t.statusCode} >= 100 AND ${t.statusCode} <= 599))
    AND jsonb_typeof(${t.payload}) = 'object'
    AND (${t.payload} - ARRAY['access_token','refresh_token','token','code','authorization','client_secret']) = ${t.payload}
    AND COALESCE(${t.payload}->>'open_id', '<REDACTED>') = '<REDACTED>'
    AND COALESCE(${t.payload}->>'union_id', '<REDACTED>') = '<REDACTED>'
    AND COALESCE(${t.payload}->>'display_name', '<REDACTED>') = '<REDACTED>'
    AND COALESCE(${t.payload}->>'username', '<REDACTED>') = '<REDACTED>'
  `),
}));

/** Lifecycle audit trail for start/callback/refresh/revoke/disconnect. Secret-free by constraint. */
export const displayAudit = pgTable('display_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: workspace(),
  userId: uuid('user_id').notNull(),
  connectionId: uuid('connection_id'),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: date('created_at').notNull().defaultNow(),
}, (t) => ({
  actor: actor('display_audit_actor_fk', t),
  connection: foreignKey({
    name: 'display_audit_connection_fk',
    columns: [t.workspaceId, t.connectionId],
    foreignColumns: [displayConnections.workspaceId, displayConnections.id],
  }).onDelete('cascade'),
  tenantTime: index('display_audit_tenant_time_idx').on(t.workspaceId, t.createdAt),
  shape: check('display_audit_shape_check', sql`
    ${t.action} IN ('authorization_start','authorization_callback','token_refresh','token_revoke','disconnect','credential_read','sync_cancel')
    AND ${t.outcome} IN ('success','failure','denied')
    AND jsonb_typeof(${t.metadata}) = 'object'
    AND NOT (${t.metadata} ?| ARRAY['access_token','refresh_token','token','code','authorization','client_secret','secret'])
  `),
}));

/**
 * Atomic rate-limit buckets. The bucket key is an HMAC of the subject, so no raw
 * IP address or user identifier is stored. The unique index makes the increment
 * a single atomic upsert, which is what makes the limit hold across instances.
 */
export const displayRateLimits = pgTable('display_rate_limits', {
  bucketKey: text('bucket_key').notNull(),
  action: text('action').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
  updatedAt: date('updated_at').notNull().defaultNow(),
}, (t) => ({
  identity: uniqueIndex('display_rate_limits_identity_idx').on(t.bucketKey, t.action, t.windowStart),
  shape: check('display_rate_limits_shape_check', sql`
    ${t.bucketKey} ~ '^[a-f0-9]{64}$'
    AND ${t.action} IN ('authorization_start','authorization_callback','token_refresh','token_revoke','disconnect')
    AND ${t.count} >= 0
  `),
}));
