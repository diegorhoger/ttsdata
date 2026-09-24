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
import { eq, isNull, gt } from 'drizzle-orm';
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
   * Get database connection.
   */
  private async getDb() {
    return drizzle(this.pool, { schema: this.schema });
  }

  /**
   * Create OAuth state record.
   */
  async createState(params: CreateStateParams): Promise<string> {
    const db = await this.getDb();
    
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
   * Consume state atomically using conditional UPDATE.
   */
  async consumeState(
    rawState: string,
    sessionHash: string
  ): Promise<ConsumeStateResult> {
    const db = await this.getDb();
    
    const stateHash = this.hashValue(rawState);
    const sessionHashHashed = this.hashSession(sessionHash);

    // Atomic conditional update
    const result = await db
      .update(schema.oauthStates)
      .set({
        consumedAt: new Date(),
      })
      .where(eq(schema.oauthStates.stateHash, stateHash))
      .where(isNull(schema.oauthStates.consumedAt))
      .where(gt(schema.oauthStates.expiresAt, new Date()))
      .returning({
        id: schema.oauthStates.id,
        stateValue: schema.oauthStates.stateValue,
        sessionHash: schema.oauthStates.sessionHash,
        consumedAt: schema.oauthStates.consumedAt,
      });

    if (result.length === 0) {
      // Check if state exists but is expired
      const existing = await db
        .select()
        .from(schema.oauthStates)
        .where(eq(schema.oauthStates.stateHash, stateHash))
        .limit(1);

      if (existing.length === 0) {
        return { success: false, error: 'state_not_found' };
      }

      return { success: false, error: 'state_expired' };
    }

    const stateRecord = result[0];
    
    // Verify session binding
    if (stateRecord.sessionHash !== sessionHashHashed) {
      return { success: false, error: 'session_mismatch' };
    }

    return {
      success: true,
      stateRecord: {
        id: stateRecord.id,
        stateValue: stateRecord.stateValue,
        sessionHash: stateRecord.sessionHash,
        consumedAt: stateRecord.consumedAt,
      },
    };
  }

  /**
   * Create probe result record.
   */
  async createProbeResult(params: CreateProbeResultParams): Promise<string> {
    const db = await this.getDb();
    
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
   * Consume probe result atomically.
   */
  async consumeProbeResult(
    resultId: string,
    sessionHash: string
  ): Promise<ConsumeProbeResultResult> {
    const db = await this.getDb();
    
    const resultIdHash = this.hashSession(resultId);
    const sessionHashHashed = this.hashSession(sessionHash);

    // Atomic conditional update
    const result = await db
      .update(schema.oauthProbeResults)
      .set({
        consumedAt: new Date(),
      })
      .where(eq(schema.oauthProbeResults.resultIdHash, resultIdHash))
      .where(isNull(schema.oauthProbeResults.consumedAt))
      .where(gt(schema.oauthProbeResults.expiresAt, new Date()))
      .returning({
        id: schema.oauthProbeResults.id,
        data: schema.oauthProbeResults.data,
        scopes: schema.oauthProbeResults.scopes,
        bothSucceeded: schema.oauthProbeResults.bothSucceeded,
        consumedAt: schema.oauthProbeResults.consumedAt,
      });

    if (result.length === 0) {
      // Check if expired
      const existing = await db
        .select()
        .from(schema.oauthProbeResults)
        .where(eq(schema.oauthProbeResults.resultIdHash, resultIdHash))
        .limit(1);

      if (existing.length === 0) {
        return { success: false, error: 'result_not_found' };
      }

      return { success: false, error: 'result_expired' };
    }

    const probeRecord = result[0];

    // Verify session binding
    if (probeRecord.sessionHash !== sessionHashHashed) {
      return { success: false, error: 'session_mismatch' };
    }

    return {
      success: true,
      probeRecord: {
        id: probeRecord.id,
        data: probeRecord.data as Record<string, any>,
        scopes: probeRecord.scopes,
        bothSucceeded: probeRecord.bothSucceeded,
        consumedAt: probeRecord.consumedAt,
      },
    };
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
