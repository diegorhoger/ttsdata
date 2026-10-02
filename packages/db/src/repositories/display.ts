/**
 * Display connection repository — Issue #20.
 *
 * Every read and mutation is tenant scoped by (workspace_id, user_id). Credentials
 * are encrypted before they touch the database and decrypted only inside an
 * explicitly audited `credential_read` path. No method returns a raw credential.
 */

import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { CredentialCipher, credentialContext } from '../credential-crypto';
import { assertDisplayOnlyScopes, assertAllApprovedScopesGranted } from '../display/capability';
import { assertNoCredentialMaterial, sanitizeDisplayEvidence } from '../display/sanitize';

export type DisplayConnectionStatus = 'active' | 'expired' | 'revoked' | 'disconnected';
export type DisplayAuditAction =
  | 'authorization_start' | 'authorization_callback' | 'token_refresh'
  | 'token_revoke' | 'disconnect' | 'credential_read' | 'sync_cancel';
export type DisplayAuditOutcome = 'success' | 'failure' | 'denied';
export type DisplaySyncJobKind = 'profile_sync' | 'video_sync';

export interface DisplayConnectionRecord {
  id: string;
  workspaceId: string;
  userId: string;
  provider: string;
  providerAccountHash: string;
  scopes: string[];
  status: DisplayConnectionStatus;
  revision: number;
  authorizedAt: Date;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
  lastRefreshedAt: Date | null;
  lastSyncAt: Date | null;
  revokedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDisplayConnectionInput {
  workspaceId: string;
  userId: string;
  providerAccountId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresInSeconds: number;
  refreshExpiresInSeconds?: number | null;
}

export interface RefreshCredentialsInput {
  workspaceId: string;
  userId: string;
  connectionId: string;
  accessToken: string;
  refreshToken: string;
  scopes: string[];
  expiresInSeconds: number;
  refreshExpiresInSeconds?: number | null;
}

export interface StoredDisplayCredentials {
  connection: DisplayConnectionRecord;
  accessToken: string;
  refreshToken: string;
}

/** Refresh when the access token is within this window of expiry. */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

type ConnectionRow = {
  id: string; workspace_id: string; user_id: string; provider: string; provider_account_hash: string;
  scopes: string[]; status: DisplayConnectionStatus; revision: number; authorized_at: Date;
  expires_at: Date; refresh_expires_at: Date | null; last_refreshed_at: Date | null; last_sync_at: Date | null;
  revoked_at: Date | null; disconnected_at: Date | null; created_at: Date; updated_at: Date;
};

const CONNECTION_COLUMNS = `id, workspace_id, user_id, provider, provider_account_hash, scopes, status,
  revision, authorized_at, expires_at, refresh_expires_at, last_refreshed_at, last_sync_at,
  revoked_at, disconnected_at, created_at, updated_at`;

function mapConnection(row: ConnectionRow): DisplayConnectionRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, userId: row.user_id, provider: row.provider,
    providerAccountHash: row.provider_account_hash, scopes: row.scopes, status: row.status,
    revision: row.revision, authorizedAt: row.authorized_at, expiresAt: row.expires_at,
    refreshExpiresAt: row.refresh_expires_at, lastRefreshedAt: row.last_refreshed_at,
    lastSyncAt: row.last_sync_at, revokedAt: row.revoked_at, disconnectedAt: row.disconnected_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class DisplayCapabilityDisabledError extends Error {
  constructor() { super('Display capability is disabled by the deployment kill switch'); this.name = 'DisplayCapabilityDisabledError'; }
}
export class DisplayConnectionNotFoundError extends Error {
  constructor() { super('Display connection not found in this tenant'); this.name = 'DisplayConnectionNotFoundError'; }
}
export class DisplayConnectionStateError extends Error {
  constructor(message: string) { super(message); this.name = 'DisplayConnectionStateError'; }
}
export class DisplayCredentialExpiredError extends Error {
  constructor() { super('Display refresh credential is no longer valid'); this.name = 'DisplayCredentialExpiredError'; }
}

export class DisplayConnectionRepository {
  private readonly ownsPool: boolean;

  constructor(
    private readonly pool: Pool,
    private readonly cipher: CredentialCipher,
    ownsPool = false,
  ) {
    this.ownsPool = ownsPool;
  }

  static fromUrl(databaseUrl: string, cipher: CredentialCipher): DisplayConnectionRepository {
    if (!databaseUrl || databaseUrl.trim() === '') throw new Error('DATABASE_URL is required');
    return new DisplayConnectionRepository(new Pool({ connectionString: databaseUrl.trim() }), cipher, true);
  }

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }

  // ---------------------------------------------------------------- capability

  async isCapabilityEnabled(): Promise<boolean> {
    const result = await this.pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM display_capability_controls WHERE singleton = true`,
    );
    return result.rows[0]?.enabled === true;
  }

  private async assertCapabilityEnabled(): Promise<void> {
    if (!await this.isCapabilityEnabled()) throw new DisplayCapabilityDisabledError();
  }

  // ------------------------------------------------------------------- audit

  async recordAudit(input: {
    workspaceId: string; userId: string; connectionId?: string | null;
    action: DisplayAuditAction; outcome: DisplayAuditOutcome; metadata?: Record<string, unknown>;
  }): Promise<void> {
    const metadata = (sanitizeDisplayEvidence(input.metadata ?? {}) as Record<string, unknown>) ?? {};
    assertNoCredentialMaterial(metadata, 'display audit metadata');
    await this.pool.query(
      `INSERT INTO display_audit (workspace_id, user_id, connection_id, action, outcome, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [input.workspaceId, input.userId, input.connectionId ?? null, input.action, input.outcome, JSON.stringify(metadata)],
    );
  }

  async listAudit(workspaceId: string, userId: string): Promise<Array<{ action: string; outcome: string; metadata: unknown; createdAt: Date }>> {
    const result = await this.pool.query<{ action: string; outcome: string; metadata: unknown; created_at: Date }>(
      `SELECT action, outcome, metadata, created_at FROM display_audit
        WHERE workspace_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC LIMIT 200`,
      [workspaceId, userId],
    );
    return result.rows.map((row) => ({ action: row.action, outcome: row.outcome, metadata: row.metadata, createdAt: row.created_at }));
  }

  // -------------------------------------------------------------- connections

  /**
   * Persist a newly authorized connection. Idempotent per provider account: a
   * re-authorization replaces the stored credentials and clears terminal state.
   */
  async createConnection(input: CreateDisplayConnectionInput): Promise<DisplayConnectionRecord> {
    await this.assertCapabilityEnabled();
    const scopes = assertAllApprovedScopesGranted(input.scopes);
    if (!Number.isSafeInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0) {
      throw new DisplayConnectionStateError('A positive token lifetime is required');
    }
    if (!input.providerAccountId) throw new DisplayConnectionStateError('Provider account identifier is required');
    const accountHash = this.cipher.accountHash(input.providerAccountId);
    const authorizedAt = new Date();
    const expiresAt = new Date(authorizedAt.getTime() + input.expiresInSeconds * 1000);
    const refreshExpiresAt = input.refreshExpiresInSeconds
      ? new Date(authorizedAt.getTime() + input.refreshExpiresInSeconds * 1000) : null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM display_connections
          WHERE workspace_id = $1 AND user_id = $2 AND provider = 'tiktok_display' AND provider_account_hash = $3
          FOR UPDATE`,
        [input.workspaceId, input.userId, accountHash],
      );
      // The AAD context binds to the connection id, so the id must exist before
      // the credentials are sealed. Generate it here for new rows.
      const connectionId = existing.rows[0]?.id ?? randomUUID();
      const identity = { workspaceId: input.workspaceId, userId: input.userId, provider: 'tiktok_display', connectionId };
      const access = this.cipher.encrypt(input.accessToken, credentialContext(identity));
      const refresh = this.cipher.encrypt(input.refreshToken, credentialContext(identity));

      let row: ConnectionRow;
      if (existing.rows[0]) {
        const updated = await client.query<ConnectionRow>(
          `UPDATE display_connections SET
             access_token_encrypted = $4, access_token_version = $5, refresh_token_encrypted = $6,
             refresh_token_version = $7, access_token_fingerprint = $8, refresh_token_fingerprint = $9,
             scopes = $10::jsonb, status = 'active', revision = revision + 1,
             authorized_at = $11, expires_at = $12, refresh_expires_at = $13,
             last_refreshed_at = NULL, revoked_at = NULL, disconnected_at = NULL, updated_at = NOW()
           WHERE workspace_id = $1 AND user_id = $2 AND id = $3
           RETURNING ${CONNECTION_COLUMNS}`,
          [input.workspaceId, input.userId, connectionId, access.encrypted, access.version, refresh.encrypted,
            refresh.version, this.cipher.fingerprint(input.accessToken), this.cipher.fingerprint(input.refreshToken),
            JSON.stringify(scopes), authorizedAt, expiresAt, refreshExpiresAt],
        );
        row = updated.rows[0];
      } else {
        const inserted = await client.query<ConnectionRow>(
          `INSERT INTO display_connections
             (id, workspace_id, user_id, provider, provider_account_hash, access_token_encrypted, access_token_version,
              refresh_token_encrypted, refresh_token_version, access_token_fingerprint, refresh_token_fingerprint,
              scopes, status, authorized_at, expires_at, refresh_expires_at)
           VALUES ($1,$2,$3,'tiktok_display',$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'active',$12,$13,$14)
           RETURNING ${CONNECTION_COLUMNS}`,
          [connectionId, input.workspaceId, input.userId, accountHash, access.encrypted, access.version, refresh.encrypted,
            refresh.version, this.cipher.fingerprint(input.accessToken), this.cipher.fingerprint(input.refreshToken),
            JSON.stringify(scopes), authorizedAt, expiresAt, refreshExpiresAt],
        );
        row = inserted.rows[0];
      }
      await client.query('COMMIT');
      return mapConnection(row);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listConnections(workspaceId: string, userId: string): Promise<DisplayConnectionRecord[]> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT ${CONNECTION_COLUMNS} FROM display_connections
        WHERE workspace_id = $1 AND user_id = $2 ORDER BY created_at DESC, id DESC`,
      [workspaceId, userId],
    );
    return result.rows.map(mapConnection);
  }

  async getConnection(workspaceId: string, userId: string, connectionId: string): Promise<DisplayConnectionRecord | null> {
    const result = await this.pool.query<ConnectionRow>(
      `SELECT ${CONNECTION_COLUMNS} FROM display_connections
        WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
      [workspaceId, userId, connectionId],
    );
    return result.rows[0] ? mapConnection(result.rows[0]) : null;
  }

  /**
   * Read credentials for an authorized sync. Audited, tenant scoped, and never
   * returns a credential for a connection that is not active.
   */
  async readCredentials(workspaceId: string, userId: string, connectionId: string): Promise<StoredDisplayCredentials> {
    const connection = await this.getConnection(workspaceId, userId, connectionId);
    if (!connection) throw new DisplayConnectionNotFoundError();
    if (connection.status !== 'active') {
      throw new DisplayConnectionStateError(`Display connection is ${connection.status} and cannot be used`);
    }
    const row = await this.pool.query<{ access_token_encrypted: string; access_token_version: number; refresh_token_encrypted: string; refresh_token_version: number }>(
      `SELECT access_token_encrypted, access_token_version, refresh_token_encrypted, refresh_token_version
         FROM display_connections WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
      [workspaceId, userId, connectionId],
    );
    if (row.rows.length !== 1) throw new DisplayConnectionNotFoundError();
    const context = credentialContext({ workspaceId, userId, provider: connection.provider, connectionId });
    const accessToken = this.cipher.decrypt(row.rows[0].access_token_encrypted, row.rows[0].access_token_version, context);
    const refreshToken = this.cipher.decrypt(row.rows[0].refresh_token_encrypted, row.rows[0].refresh_token_version, context);
    await this.recordAudit({ workspaceId, userId, connectionId, action: 'credential_read', outcome: 'success', metadata: { revision: connection.revision } });
    return { connection, accessToken, refreshToken };
  }

  /**
   * Durably replace credentials after a refresh. Optimistic on revision so two
   * concurrent refreshes cannot interleave and strand a stale token.
   */
  async replaceCredentials(input: RefreshCredentialsInput): Promise<DisplayConnectionRecord> {
    const scopes = assertDisplayOnlyScopes(input.scopes);
    if (!Number.isSafeInteger(input.expiresInSeconds) || input.expiresInSeconds <= 0) {
      throw new DisplayConnectionStateError('A positive token lifetime is required');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Deliberately NOT `FOR UPDATE`: the conditional UPDATE on `revision` below
      // is the single arbiter, so two concurrent refreshes produce exactly one
      // winner instead of serializing and both succeeding.
      const current = await client.query<ConnectionRow>(
        `SELECT ${CONNECTION_COLUMNS} FROM display_connections
          WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
        [input.workspaceId, input.userId, input.connectionId],
      );
      if (current.rows.length !== 1) throw new DisplayConnectionNotFoundError();
      const existing = mapConnection(current.rows[0]);
      if (existing.status === 'revoked' || existing.status === 'disconnected') {
        throw new DisplayConnectionStateError(`Display connection is ${existing.status} and cannot be refreshed`);
      }
      if (existing.refreshExpiresAt && existing.refreshExpiresAt.getTime() <= Date.now()) {
        throw new DisplayCredentialExpiredError();
      }
      const now = new Date();
      const context = credentialContext({ workspaceId: input.workspaceId, userId: input.userId, provider: existing.provider, connectionId: existing.id });
      const access = this.cipher.encrypt(input.accessToken, context);
      const refresh = this.cipher.encrypt(input.refreshToken, context);
      const refreshExpiresAt = input.refreshExpiresInSeconds
        ? new Date(now.getTime() + input.refreshExpiresInSeconds * 1000) : existing.refreshExpiresAt;
      const result = await client.query<ConnectionRow>(
        `UPDATE display_connections SET
           access_token_encrypted = $4, access_token_version = $5, refresh_token_encrypted = $6,
           refresh_token_version = $7, access_token_fingerprint = $8, refresh_token_fingerprint = $9,
           scopes = $10::jsonb, status = 'active', revision = revision + 1,
           expires_at = $11, refresh_expires_at = $12, last_refreshed_at = $13, updated_at = NOW()
         WHERE workspace_id = $1 AND user_id = $2 AND id = $3 AND revision = $14
         RETURNING ${CONNECTION_COLUMNS}`,
        [input.workspaceId, input.userId, input.connectionId, access.encrypted, access.version, refresh.encrypted,
          refresh.version, this.cipher.fingerprint(input.accessToken), this.cipher.fingerprint(input.refreshToken),
          JSON.stringify(scopes), new Date(now.getTime() + input.expiresInSeconds * 1000), refreshExpiresAt, now,
          existing.revision],
      );
      if (result.rows.length !== 1) throw new DisplayConnectionStateError('Display connection changed during refresh');
      await client.query('COMMIT');
      return mapConnection(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markRevoked(workspaceId: string, userId: string, connectionId: string): Promise<DisplayConnectionRecord> {
    const result = await this.pool.query<ConnectionRow>(
      `UPDATE display_connections SET status = 'revoked', revoked_at = NOW(), revision = revision + 1, updated_at = NOW()
        WHERE workspace_id = $1 AND user_id = $2 AND id = $3 AND status NOT IN ('disconnected')
        RETURNING ${CONNECTION_COLUMNS}`,
      [workspaceId, userId, connectionId],
    );
    if (result.rows.length !== 1) throw new DisplayConnectionNotFoundError();
    return mapConnection(result.rows[0]);
  }

  async markExpired(workspaceId: string, userId: string, connectionId: string): Promise<DisplayConnectionRecord> {
    const result = await this.pool.query<ConnectionRow>(
      `UPDATE display_connections SET status = 'expired', revision = revision + 1, updated_at = NOW()
        WHERE workspace_id = $1 AND user_id = $2 AND id = $3 AND status = 'active'
        RETURNING ${CONNECTION_COLUMNS}`,
      [workspaceId, userId, connectionId],
    );
    if (result.rows.length !== 1) throw new DisplayConnectionNotFoundError();
    return mapConnection(result.rows[0]);
  }

  /**
   * Terminal disconnect: cancel queued work, delete credentials, transition state.
   * Credentials are overwritten with a tombstone ciphertext rather than nulled so
   * the shape constraint still holds and no plaintext can be recovered.
   */
  async disconnect(workspaceId: string, userId: string, connectionId: string): Promise<{ connection: DisplayConnectionRecord; cancelledJobs: number }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<ConnectionRow>(
        `SELECT ${CONNECTION_COLUMNS} FROM display_connections
          WHERE workspace_id = $1 AND user_id = $2 AND id = $3 FOR UPDATE`,
        [workspaceId, userId, connectionId],
      );
      if (current.rows.length !== 1) throw new DisplayConnectionNotFoundError();
      const existing = mapConnection(current.rows[0]);

      const cancelled = await client.query(
        `UPDATE display_sync_jobs SET status = 'cancelled', finished_at = NOW(), updated_at = NOW()
          WHERE workspace_id = $1 AND connection_id = $2 AND status IN ('queued','running')
          RETURNING id`,
        [workspaceId, connectionId],
      );
      const cancelledJobs = cancelled.rowCount ?? 0;

      const tombstone = this.cipher.encrypt(`revoked:${existing.id}:${Date.now()}`, credentialContext({
        workspaceId, userId, provider: existing.provider, connectionId: existing.id,
      }));
      const result = await client.query<ConnectionRow>(
        `UPDATE display_connections SET
           access_token_encrypted = $4, access_token_version = $5,
           refresh_token_encrypted = $6, refresh_token_version = $7,
           status = 'disconnected', disconnected_at = NOW(), revoked_at = COALESCE(revoked_at, NOW()),
           revision = revision + 1, updated_at = NOW()
         WHERE workspace_id = $1 AND user_id = $2 AND id = $3
         RETURNING ${CONNECTION_COLUMNS}`,
        [workspaceId, userId, connectionId, tombstone.encrypted, tombstone.version, tombstone.encrypted, tombstone.version],
      );
      await client.query('COMMIT');
      return { connection: mapConnection(result.rows[0]), cancelledJobs };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------------------- jobs

  async enqueueSyncJob(input: { workspaceId: string; userId: string; connectionId: string; kind: DisplaySyncJobKind }): Promise<{ id: string }> {
    const connection = await this.getConnection(input.workspaceId, input.userId, input.connectionId);
    if (!connection) throw new DisplayConnectionNotFoundError();
    if (connection.status !== 'active') {
      throw new DisplayConnectionStateError(`Display connection is ${connection.status}; sync cannot be queued`);
    }
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO display_sync_jobs (workspace_id, user_id, connection_id, kind, status)
       VALUES ($1, $2, $3, $4, 'queued') RETURNING id`,
      [input.workspaceId, input.userId, input.connectionId, input.kind],
    );
    return { id: result.rows[0].id };
  }

  /** Real cancellation: returns the number of jobs actually transitioned. */
  async cancelQueuedJobs(workspaceId: string, connectionId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE display_sync_jobs SET status = 'cancelled', finished_at = NOW(), updated_at = NOW()
        WHERE workspace_id = $1 AND connection_id = $2 AND status IN ('queued','running')
        RETURNING id`,
      [workspaceId, connectionId],
    );
    return result.rowCount ?? 0;
  }

  async countJobs(workspaceId: string, connectionId: string, status?: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      status
        ? `SELECT COUNT(*)::text AS count FROM display_sync_jobs WHERE workspace_id = $1 AND connection_id = $2 AND status = $3`
        : `SELECT COUNT(*)::text AS count FROM display_sync_jobs WHERE workspace_id = $1 AND connection_id = $2`,
      status ? [workspaceId, connectionId, status] : [workspaceId, connectionId],
    );
    return Number(result.rows[0]?.count ?? '0');
  }

  // --------------------------------------------------------------- evidence

  async recordProbeEvidence(input: {
    workspaceId: string; userId: string; connectionId?: string | null;
    operation: 'user_info' | 'video_list'; succeeded: boolean; statusCode?: number | null;
    payload?: Record<string, unknown>; errorCode?: string | null;
  }): Promise<void> {
    const payload = (sanitizeDisplayEvidence(input.payload ?? {}) as Record<string, unknown>) ?? {};
    assertNoCredentialMaterial(payload, 'display probe evidence');
    if (input.errorCode) assertNoCredentialMaterial(input.errorCode, 'display probe error code');
    await this.pool.query(
      `INSERT INTO display_probe_evidence (workspace_id, user_id, connection_id, operation, succeeded, status_code, payload, error_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [input.workspaceId, input.userId, input.connectionId ?? null, input.operation, input.succeeded,
        input.statusCode ?? null, JSON.stringify(payload), input.errorCode ?? null],
    );
  }

  async listProbeEvidence(workspaceId: string, userId: string): Promise<Array<{ operation: string; succeeded: boolean; payload: unknown; observedAt: Date }>> {
    const result = await this.pool.query<{ operation: string; succeeded: boolean; payload: unknown; observed_at: Date }>(
      `SELECT operation, succeeded, payload, observed_at FROM display_probe_evidence
        WHERE workspace_id = $1 AND user_id = $2 ORDER BY observed_at DESC, id DESC LIMIT 100`,
      [workspaceId, userId],
    );
    return result.rows.map((row) => ({ operation: row.operation, succeeded: row.succeeded, payload: row.payload, observedAt: row.observed_at }));
  }

  async markSynced(workspaceId: string, userId: string, connectionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE display_connections SET last_sync_at = NOW(), updated_at = NOW()
        WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
      [workspaceId, userId, connectionId],
    );
  }
}
