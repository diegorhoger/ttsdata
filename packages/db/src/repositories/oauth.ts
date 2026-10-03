/**
 * OAuth Repository — PostgreSQL-backed OAuth state and probe result management
 * Contracts: independent rawState (string), sessionId (string), resultId (string).
 * Hashes are computed ONCE inside the repository for DB storage/comparison.
 */

import { Pool, PoolConfig } from 'pg';
import { createHmac } from 'node:crypto';

export interface OAuthConfig {
  stateSecret: string;
  sessionSecret: string;
  resultSecret?: string;
}

/**
 * Clock-skew tolerance applied to state issuance.
 *
 * A state whose `issued_at` is further in the future than this is rejected: it
 * cannot have been issued by a correctly-clocked server in this deployment.
 * The 5000ms allowance matches the established browser-cookie policy in
 * `apps/web/src/lib/oauth` (a future-issued cookie beyond 5000ms is refused),
 * so both consumers apply the same invariant.
 */
export const STATE_FUTURE_SKEW_MS = 5_000;

/** SQL predicate: the record was not issued meaningfully in the future. */
const NOT_FUTURE_ISSUED = `issued_at <= NOW() + INTERVAL '5000 milliseconds'`;

export interface CreateStateInput {
  rawState: string;         // the OAuth state value (sent to TikTok)
  sessionId: string;         // independent session identifier
  expiresAt: Date;
  /** Optional tenant binding: when present, only this workspace/user may consume. */
  workspaceId?: string;
  userId?: string;
}

export interface CreateProbeResultInput {
  resultId: string;          // independent random result identifier
  sessionId: string;
  data: Record<string, unknown>;
  scopes: string;
  bothSucceeded: boolean;
  expiresAt: Date;
}

export interface ConsumeStateResult {
  success: boolean;
  error?: 'state_not_found' | 'already_consumed' | 'expired' | 'session_mismatch' | 'future_issued';
  sessionId?: string;
  consumedAt?: Date;
  workspaceId?: string;
  userId?: string;
}

export interface ConsumeProbeResultResult {
  success: boolean;
  error?: 'result_not_found' | 'already_consumed' | 'expired' | 'session_mismatch';
  data?: Record<string, unknown>;
  scopes?: string;
  bothSucceeded?: boolean;
  consumedAt?: Date;
}

export class OAuthRepository {
  private externalPool?: import('pg').Pool;
  private pool: Pool;
  private config: OAuthConfig;

  constructor(poolOrUrl: import('pg').Pool | string, config: OAuthConfig) {
    if (typeof poolOrUrl === 'string') {
      const url = poolOrUrl.trim();
      if (!url) throw new Error('DATABASE_URL is required and must not be empty');
      this.pool = new Pool({ connectionString: url } as import('pg').PoolConfig);
      this.externalPool = undefined;
    } else {
      this.pool = poolOrUrl;
      this.externalPool = poolOrUrl;
    }
    if (!config) throw new Error('OAuthConfig is required');
    this.config = config;
  }

  // Hash raw state value once with stateSecret
  private hashState(value: string): string {
    return createHmac('sha256', this.config.stateSecret)
      .update(value)
      .digest('hex');
  }

  // Hash session identifier once with sessionSecret
  private hashSession(value: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(value)
      .digest('hex');
  }

  // Hash result identifier once (use resultSecret or sessionSecret consistently)
  private hashResult(value: string): string {
    const secret = this.config.resultSecret || this.config.sessionSecret;
    return createHmac('sha256', secret)
      .update(value)
      .digest('hex');
  }

  async createState(input: CreateStateInput): Promise<string> {
    const stateHash = this.hashState(input.rawState);
    const sessionHash = this.hashSession(input.sessionId);
    const issuedAt = new Date();
    if (!(input.expiresAt instanceof Date) || Number.isNaN(input.expiresAt.getTime())
        || input.expiresAt.getTime() <= issuedAt.getTime()) {
      throw new Error('State expiry must be a valid time after issuance');
    }
    const result = await this.pool.query(
      `INSERT INTO oauth_states (state_hash, session_hash, issued_at, expires_at, workspace_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (state_hash) DO NOTHING
       RETURNING id`,
      [stateHash, sessionHash, issuedAt, input.expiresAt,
        input.workspaceId ?? null, input.userId ?? null]
    );
    if (result.rowCount === 0) {
      throw new Error('State creation conflict: state_hash already exists');
    }
    return stateHash;
  }

  async consumeState(rawState: string, sessionId: string): Promise<ConsumeStateResult> {
    const stateHash = this.hashState(rawState);
    const sessionHash = this.hashSession(sessionId);
    const result = await this.pool.query(
      `UPDATE oauth_states
       SET consumed_at = NOW()
       WHERE state_hash = $1
         AND session_hash = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
         AND ${NOT_FUTURE_ISSUED}
       RETURNING id, session_hash, consumed_at`,
      [stateHash, sessionHash]
    );
    if (result.rows.length === 0) {
      const exists = await this.pool.query(
        `SELECT consumed_at, session_hash, expires_at, issued_at FROM oauth_states WHERE state_hash = $1 LIMIT 1`,
        [stateHash]
      );
      if (exists.rows.length === 0) return { success: false, error: 'state_not_found' };
      const row = exists.rows[0];
      if (row.consumed_at) return { success: false, error: 'already_consumed' };
      if (new Date(row.issued_at).getTime() > Date.now() + STATE_FUTURE_SKEW_MS) {
        return { success: false, error: 'future_issued' };
      }
      if (new Date(row.expires_at) < new Date()) return { success: false, error: 'expired' };
      if (row.session_hash !== sessionHash) return { success: false, error: 'session_mismatch' };
      return { success: false, error: 'expired' };
    }
    const r = result.rows[0];
    return {
      success: true,
      sessionId,
      consumedAt: r.consumed_at,
    };
  }

  async createProbeResult(input: CreateProbeResultInput): Promise<string> {
    const resultIdHash = this.hashResult(input.resultId);
    const sessionHash = this.hashSession(input.sessionId);
    const result = await this.pool.query(
      `INSERT INTO oauth_probe_results (result_id_hash, session_hash, data, scopes, both_succeeded, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (result_id_hash) DO NOTHING
       RETURNING id`,
      [
        resultIdHash,
        sessionHash,
        JSON.stringify(input.data),
        input.scopes,
        input.bothSucceeded,
        input.expiresAt,
      ]
    );
    if (result.rowCount !== 1) {
      throw new Error('Probe result insertion conflict or failure: expected exactly 1 row');
    }
    return input.resultId;
  }

  async consumeProbeResult(resultId: string, sessionId: string): Promise<ConsumeProbeResultResult> {
    const resultIdHash = this.hashResult(resultId);
    const sessionHash = this.hashSession(sessionId);
    const result = await this.pool.query(
      `UPDATE oauth_probe_results
       SET consumed_at = NOW()
       WHERE result_id_hash = $1
         AND session_hash = $2
         AND consumed_at IS NULL
         AND expires_at > NOW()
       RETURNING id, data, scopes, both_succeeded, consumed_at`,
      [resultIdHash, sessionHash]
    );
    if (result.rows.length === 0) {
      const exists = await this.pool.query(
        `SELECT consumed_at, session_hash, expires_at FROM oauth_probe_results WHERE result_id_hash = $1 LIMIT 1`,
        [resultIdHash]
      );
      if (exists.rows.length === 0) return { success: false, error: 'result_not_found' };
      const row = exists.rows[0];
      if (row.consumed_at) return { success: false, error: 'already_consumed' };
      if (new Date(row.expires_at) < new Date()) return { success: false, error: 'expired' };
      if (row.session_hash !== sessionHash) return { success: false, error: 'session_mismatch' };
      return { success: false, error: 'expired' };
    }
    const r = result.rows[0];
    // PostgreSQL jsonb: parse automatically or treat as object
    let parsedData: Record<string, unknown> = {};
    try {
      if (r.data && typeof r.data === 'string') {
        parsedData = JSON.parse(r.data);
      } else if (r.data && typeof r.data === 'object') {
        parsedData = r.data as Record<string, unknown>;
      }
    } catch {
      parsedData = {};
    }
    return {
      success: true,
      data: parsedData,
      scopes: r.scopes,
      bothSucceeded: r.both_succeeded,
      consumedAt: r.consumed_at,
    };
  }

  /**
   * Atomic single-use consumption inside one transaction.
   *
   * The merged implementation already makes consumption atomic through a
   * conditional UPDATE; this wrapper adds an explicit transaction and row lock so
   * the failure diagnosis cannot race a concurrent winner. Behaviour is
   * identical to `consumeState` for callers, including replay detection.
   */
  async consumeStateAtomic(rawState: string, sessionId: string): Promise<ConsumeStateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stateHash = this.hashState(rawState);
      const sessionHash = this.hashSession(sessionId);
      const locked = await client.query(
        `SELECT consumed_at, session_hash, expires_at, issued_at, workspace_id, user_id FROM oauth_states
          WHERE state_hash = $1 FOR UPDATE`,
        [stateHash],
      );
      if (locked.rows.length === 0) {
        await client.query('COMMIT');
        return { success: false, error: 'state_not_found' };
      }
      const row = locked.rows[0];
      if (row.consumed_at) {
        await client.query('COMMIT');
        return { success: false, error: 'already_consumed' };
      }
      if (new Date(row.issued_at).getTime() > Date.now() + STATE_FUTURE_SKEW_MS) {
        await client.query('COMMIT');
        return { success: false, error: 'future_issued' };
      }
      if (row.session_hash !== sessionHash) {
        await client.query('COMMIT');
        return { success: false, error: 'session_mismatch' };
      }
      if (new Date(row.expires_at) < new Date()) {
        await client.query('COMMIT');
        return { success: false, error: 'expired' };
      }
      const consumed = await client.query(
        `UPDATE oauth_states SET consumed_at = NOW()
          WHERE state_hash = $1 AND consumed_at IS NULL AND ${NOT_FUTURE_ISSUED} RETURNING consumed_at`,
        [stateHash],
      );
      await client.query('COMMIT');
      if (consumed.rows.length !== 1) return { success: false, error: 'already_consumed' };
      return {
        success: true,
        sessionId,
        consumedAt: consumed.rows[0].consumed_at,
        workspaceId: row.workspace_id ?? undefined,
        userId: row.user_id ?? undefined,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Consume a tenant-bound state (the Display callback flow).
   *
   * The provider redirects the browser to the callback, which carries no
   * session, so the tenant binding on the state record is the authorization.
   * A state that is not tenant-bound is refused: this method must never become
   * a way to consume an arbitrary session-bound state without its session.
   *
   * Consumption is atomic and single-use, exactly like `consumeStateAtomic`.
   */
  async consumeTenantBoundState(rawState: string): Promise<ConsumeStateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const stateHash = this.hashState(rawState);
      const locked = await client.query(
        `SELECT consumed_at, expires_at, issued_at, workspace_id, user_id FROM oauth_states
          WHERE state_hash = $1 FOR UPDATE`,
        [stateHash],
      );
      if (locked.rows.length === 0) {
        await client.query('COMMIT');
        return { success: false, error: 'state_not_found' };
      }
      const row = locked.rows[0];
      if (row.consumed_at) {
        await client.query('COMMIT');
        return { success: false, error: 'already_consumed' };
      }
      // A record issued meaningfully in the future was not issued by a
      // correctly-clocked server in this deployment: fail closed and do NOT
      // mark it consumed.
      if (new Date(row.issued_at).getTime() > Date.now() + STATE_FUTURE_SKEW_MS) {
        await client.query('COMMIT');
        return { success: false, error: 'future_issued' };
      }
      if (new Date(row.expires_at) < new Date()) {
        await client.query('COMMIT');
        return { success: false, error: 'expired' };
      }
      if (!row.workspace_id || !row.user_id) {
        await client.query('COMMIT');
        return { success: false, error: 'session_mismatch' };
      }
      const consumed = await client.query(
        `UPDATE oauth_states SET consumed_at = NOW()
          WHERE state_hash = $1 AND consumed_at IS NULL AND ${NOT_FUTURE_ISSUED} RETURNING consumed_at`,
        [stateHash],
      );
      await client.query('COMMIT');
      if (consumed.rows.length !== 1) return { success: false, error: 'already_consumed' };
      return {
        success: true,
        consumedAt: consumed.rows[0].consumed_at,
        workspaceId: row.workspace_id,
        userId: row.user_id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(
      `DELETE FROM oauth_states WHERE expires_at < NOW()`,
    );
    await this.pool.query(
      `DELETE FROM oauth_probe_results WHERE expires_at < NOW()`,
    );
  }

  async close(): Promise<void> {
    if (!this.externalPool) {
      await this.pool.end();
    }
    // Shared pool: do NOT terminate
  }
}
