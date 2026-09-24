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

export interface CreateStateInput {
  rawState: string;         // the OAuth state value (sent to TikTok)
  sessionId: string;         // independent session identifier
  expiresAt: Date;
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
  error?: 'state_not_found' | 'already_consumed' | 'expired' | 'session_mismatch';
  sessionId?: string;
  consumedAt?: Date;
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
  private pool: Pool;
  private config: OAuthConfig;

  constructor(databaseUrl: string, config: OAuthConfig) {
    if (!databaseUrl || databaseUrl.trim() === '') {
      throw new Error('DATABASE_URL is required and must not be empty');
    }
    // Fail-closed: no silent localhost defaults
    this.pool = new Pool({ connectionString: databaseUrl } as PoolConfig);
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
    const result = await this.pool.query(
      `INSERT INTO oauth_states (state_hash, session_hash, issued_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (state_hash) DO NOTHING
       RETURNING id`,
      [stateHash, sessionHash, new Date(), input.expiresAt]
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
       RETURNING id, session_hash, consumed_at`,
      [stateHash, sessionHash]
    );
    if (result.rows.length === 0) {
      const exists = await this.pool.query(
        `SELECT consumed_at, session_hash, expires_at FROM oauth_states WHERE state_hash = $1 LIMIT 1`,
        [stateHash]
      );
      if (exists.rows.length === 0) return { success: false, error: 'state_not_found' };
      const row = exists.rows[0];
      if (row.consumed_at) return { success: false, error: 'already_consumed' };
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
    await this.pool.query(
      `INSERT INTO oauth_probe_results (result_id_hash, session_hash, data, scopes, both_succeeded, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (result_id_hash) DO NOTHING`,
      [
        resultIdHash,
        sessionHash,
        JSON.stringify(input.data),
        input.scopes,
        input.bothSucceeded,
        input.expiresAt,
      ]
    );
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

  async cleanupExpired(): Promise<void> {
    await this.pool.query(
      `DELETE FROM oauth_states WHERE expires_at < NOW()`,
    );
    await this.pool.query(
      `DELETE FROM oauth_probe_results WHERE expires_at < NOW()`,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
