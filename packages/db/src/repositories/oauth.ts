/**
 * OAuth Repository — PostgreSQL-backed OAuth state and probe result management
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
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
  sessionHash: string;  // This is the session hash to store
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

  constructor(databaseUrl: string, config: OAuthConfig) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.config = config;
  }

  private hashValue(value: string): string {
    return createHmac('sha256', this.config.stateSecret)
      .update(value)
      .digest('hex');
  }

  private hashSession(sessionId: string): string {
    return createHmac('sha256', this.config.sessionSecret)
      .update(sessionId)
      .digest('hex');
  }

  async createState(params: CreateStateParams): Promise<string> {
    const db = drizzle(this.pool, { schema });
    // The stateHash is the hash of the sessionHash (which is the hashed session ID)
    // This becomes the unique identifier for the state record
    const stateHash = this.hashValue(params.sessionHash);
    
    await db.insert(schema.oauthStates)
      .values({
        stateHash,
        sessionHash: params.sessionHash,
        issuedAt: new Date(),
        expiresAt: params.expiresAt,
      });
    
    return stateHash;
  }

  async consumeState(rawState: string, sessionHash: string): Promise<ConsumeStateResult> {
    const client = await this.pool.connect();
    try {
      // Hash the rawState to get the state_hash to look up
      const stateHash = this.hashValue(rawState);
      // Hash the sessionHash param to compare with stored session_hash
      const sessionHashHashed = this.hashSession(sessionHash);

      // ATOMIC: Update only if state_hash matches, session_hash matches, not consumed, not expired
      const result = await client.query(`
        UPDATE oauth_states 
        SET consumed_at = NOW()
        WHERE state_hash = $1
          AND session_hash = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id
      `, [stateHash, sessionHashHashed]);

      if (result.rows.length === 0) {
        // Determine the reason for failure
        const existsCheck = await client.query(
          `SELECT id, consumed_at, session_hash FROM oauth_states WHERE state_hash = $1 LIMIT 1`,
          [stateHash]
        );
        if (existsCheck.rows.length === 0) {
          return { success: false, error: 'state_not_found' };
        }
        const existing = existsCheck.rows[0];
        if (existing.consumed_at !== null) {
          return { success: false, error: 'state_already_consumed' };
        }
        if (existing.session_hash !== sessionHashHashed) {
          return { success: false, error: 'session_mismatch' };
        }
        return { success: false, error: 'state_expired' };
      }

      return {
        success: true,
        stateRecord: {
          id: result.rows[0].id,
          sessionHash: sessionHash,
          consumedAt: new Date(),
        },
      };
    } finally {
      client.release();
    }
  }

  async createProbeResult(params: CreateProbeResultParams): Promise<string> {
    const db = drizzle(this.pool, { schema });
    // Hash the resultId to create the result_id_hash
    const resultIdHash = this.hashSession(params.resultId);
    
    await db.insert(schema.oauthProbeResults)
      .values({
        resultIdHash,
        sessionHash: params.sessionHash,
        data: params.data,
        scopes: params.scopes,
        bothSucceeded: params.bothSucceeded,
        expiresAt: params.expiresAt,
      });
    
    return params.resultId;
  }

  async consumeProbeResult(resultId: string, sessionHash: string): Promise<ConsumeProbeResultResult> {
    const client = await this.pool.connect();
    try {
      const resultIdHash = this.hashSession(resultId);
      const sessionHashHashed = this.hashSession(sessionHash);

      // ATOMIC: Update only if result_id_hash matches, session_hash matches, not consumed, not expired
      const result = await client.query(`
        UPDATE oauth_probe_results 
        SET consumed_at = NOW()
        WHERE result_id_hash = $1
          AND session_hash = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING id, data, scopes, both_succeeded, consumed_at
      `, [resultIdHash, sessionHashHashed]);

      if (result.rows.length === 0) {
        // Determine the reason for failure
        const existsCheck = await client.query(
          `SELECT id, consumed_at, session_hash FROM oauth_probe_results WHERE result_id_hash = $1 LIMIT 1`,
          [resultIdHash]
        );
        if (existsCheck.rows.length === 0) {
          return { success: false, error: 'result_not_found' };
        }
        const existing = existsCheck.rows[0];
        if (existing.consumed_at !== null) {
          return { success: false, error: 'result_already_consumed' };
        }
        if (existing.session_hash !== sessionHashHashed) {
          return { success: false, error: 'session_mismatch' };
        }
        return { success: false, error: 'result_expired' };
      }

      const probeRecord = result.rows[0];

      // Verify session binding (should always match since we include it in WHERE)
      if (probeRecord.session_hash !== sessionHashHashed) {
        return { success: false, error: 'session_mismatch' };
      }

      // PostgreSQL returns jsonb as a parsed object, not a string
      const data = probeRecord.data as Record<string, any> || {};

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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
