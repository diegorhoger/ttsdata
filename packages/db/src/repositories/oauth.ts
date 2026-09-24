/**
 * OAuth Repository — PostgreSQL-backed OAuth state and probe result management
 * 
 * Handles:
 * - OAuth state registration, retrieval, and atomic consumption
 * - Probe result storage and atomic consumption
 * - Session validation
 * 
 * Uses PostgreSQL via Drizzle ORM for cross-instance durability.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient } from 'pg';
import * as schema from '../schema';
import { createHmac } from 'crypto';

export interface OAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  sessionSecret: string;
}

export interface CreateStateParams {
  stateValue: string;
  sessionHash: string;
  expiresAt: Date;
}

export interface CreateProbeResultParams {
  resultId: string;
  sessionHash: string;
  data: Record<string, any>;
  scopes: string;
  bothSucceeded: boolean;
  expiresAt: Date;
}

export interface ConsumeStateResult {
  success: boolean;
  error?: string;
  stateRecord?: {
    id: string;
    stateValue: string;
    sessionHash: string;
    consumedAt: Date | null;
  };
}

export interface ConsumeProbeResultResult {
  success: boolean;
  error?: string;
  probeRecord?: {
    id: string;
    data: Record<string, any>;
    scopes: string;
    bothSucceeded: boolean;
    consumedAt: Date;
  };
}

export class OAuthRepository {
  private pool: Pool;
  private config: OAuthConfig;

  constructor(
    databaseUrl: string,
    config: OAuthConfig
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.config = config;
  }

  /**
   * Create a cryptographically secure hash of a value.
   */
  private hashValue(value: string): string {
    return createHmac('sha256', this.config.stateSecret)
      .update(value)
      .digest('hex');
  }

  /**
   * Create a session hash.
   */
  private hashSession(sessionId: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(sessionId)
      .digest('hex');
  }

  /**
   * Get Drizzle database instance.
   */
  private getDb(): ReturnType<typeof drizzle> {
    return drizzle(this.pool, { schema });
  }

  /**
   * Create OAuth state record.
   */
  async createState(params: CreateStateParams): Promise<string> {
    const db = this.getDb();
    
    const stateHash = this.hashValue(params.stateValue);
    
    await db.insert(schema.oauthStates)
      .values({
        stateHash,
        sessionHash: this.hashSession(params.sessionHash),
        stateValue: params.stateValue,
        expiresAt: params.expiresAt,
      });
    
    return stateHash;
  }

  /**
   * Consume state atomically using conditional UPDATE with raw SQL.
   */
  async consumeState(
    rawState: string,
    sessionHash: string
  ): Promise<ConsumeStateResult> {
    const client = await this.pool.connect();
    
    try {
      const stateHash = this.hashValue(rawState);
      const sessionHashHashed = this.hashSession(sessionHash);

      // Use raw SQL for atomic conditional update
      const result = await client.query(`
        UPDATE oauth_states 
        SET consumed_at = NOW()
        WHERE state_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id, state_value, session_hash, consumed_at
      `, [stateHash]);

      if (result.rows.length === 0) {
        // Check if state exists at all
        const existing = await client.query(
          `SELECT id FROM oauth_states WHERE state_hash = $1 LIMIT 1`,
          [stateHash]
        );

        if (existing.rows.length === 0) {
          return { success: false, error: 'state_not_found' };
        }

        return { success: false, error: 'state_expired' };
      }

      const stateRecord = result.rows[0];

      // Verify session binding
      if (stateRecord.session_hash !== sessionHashHashed) {
        return { success: false, error: 'session_mismatch' };
      }

      return {
        success: true,
        stateRecord: {
          id: stateRecord.id,
          stateValue: stateRecord.state_value,
          sessionHash: stateRecord.session_hash,
          consumedAt: stateRecord.consumed_at,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Create probe result record.
   */
  async createProbeResult(params: CreateProbeResultParams): Promise<string> {
    const db = this.getDb();
    
    const resultIdHash = this.hashSession(params.resultId);
    
    await db.insert(schema.oauthProbeResults)
      .values({
        resultIdHash,
        sessionHash: this.hashSession(params.sessionHash),
        data: params.data,
        scopes: params.scopes,
        bothSucceeded: params.bothSucceeded,
        expiresAt: params.expiresAt,
      });
    
    return params.resultId;
  }

  /**
   * Consume probe result atomically using raw SQL.
   */
  async consumeProbeResult(
    resultId: string,
    sessionHash: string
  ): Promise<ConsumeProbeResultResult> {
    const client = await this.pool.connect();
    
    try {
      const resultIdHash = this.hashSession(resultId);
      const sessionHashHashed = this.hashSession(sessionHash);

      const result = await client.query(`
        UPDATE oauth_probe_results 
        SET consumed_at = NOW()
        WHERE result_id_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id, data, scopes, both_succeeded, consumed_at
      `, [resultIdHash]);

      if (result.rows.length === 0) {
        // Check if exists
        const existing = await client.query(
          `SELECT id FROM oauth_probe_results WHERE result_id_hash = $1 LIMIT 1`,
          [resultIdHash]
        );

        if (existing.rows.length === 0) {
          return { success: false, error: 'result_not_found' };
        }

        return { success: false, error: 'result_expired' };
      }

      const probeRecord = result.rows[0];

      // Verify session binding
      if (probeRecord.session_hash !== sessionHashHashed) {
        return { success: false, error: 'session_mismatch' };
      }

      // Parse data JSON
      let data: Record<string, any> = {};
      try {
        data = JSON.parse(probeRecord.data);
      } catch {
        data = {};
      }

      return {
        success: true,
        probeRecord: {
          id: probeRecord.id,
          data,
          scopes: probeRecord.scopes,
          bothSucceeded: probeRecord.both_succeeded,
          consumedAt: probeRecord.consumed_at,
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate OAuth configuration.
   */
  validateConfiguration(): void {
    if (!this.config.clientKey) throw new Error('clientKey is not configured');
    if (!this.config.clientSecret) throw new Error('clientSecret is not configured');
    if (!this.config.redirectUri) throw new Error('redirectUri is not configured');
    if (!this.config.stateSecret) throw new Error('stateSecret is not configured');
    if (!this.config.sessionSecret) throw new Error('sessionSecret is not configured');
  }

  /**
   * Close database connection.
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
