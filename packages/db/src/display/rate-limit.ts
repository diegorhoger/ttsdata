/**
 * Durable, atomic rate limiting for the Display lifecycle endpoints.
 *
 * The counter lives in PostgreSQL so the limit holds across concurrent and
 * serverless instances — an in-process counter would be trivially bypassed by a
 * second instance. The bucket key is always a hash, never a raw identifier.
 */

import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export type DisplayRateLimitedAction = 'authorization_start' | 'authorization_callback' | 'token_refresh' | 'token_revoke' | 'disconnect';

export const DISPLAY_RATE_LIMITS: Record<DisplayRateLimitedAction, { limit: number; windowMs: number }> = {
  authorization_start: { limit: 20, windowMs: 60_000 },
  authorization_callback: { limit: 20, windowMs: 60_000 },
  token_refresh: { limit: 30, windowMs: 60_000 },
  token_revoke: { limit: 10, windowMs: 60_000 },
  disconnect: { limit: 10, windowMs: 60_000 },
};

export interface DisplayRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class DisplayRateLimiter {
  constructor(private readonly pool: Pool, private readonly secret: string) {
    if (!secret || secret.length < 16) throw new Error('A rate limit keying secret is required');
  }

  /** Subject is hashed so an IP or user id is never persisted. */
  private bucketKey(subject: string): string {
    return createHmac('sha256', this.secret).update(subject).digest('hex');
  }

  async consume(action: DisplayRateLimitedAction, subject: string, now = Date.now()): Promise<DisplayRateLimitResult> {
    const { limit, windowMs } = DISPLAY_RATE_LIMITS[action];
    const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
    const key = this.bucketKey(subject);
    const result = await this.pool.query<{ count: number }>(
      `INSERT INTO display_rate_limits (bucket_key, action, window_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (bucket_key, action, window_start)
       DO UPDATE SET count = display_rate_limits.count + 1
       RETURNING count`,
      [key, action, windowStart],
    );
    const count = result.rows[0]?.count ?? 1;
    const allowed = count <= limit;
    const windowEnd = windowStart.getTime() + windowMs;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((windowEnd - now) / 1000)),
    };
  }

  async prune(now = Date.now()): Promise<number> {
    const oldest = new Date(now - 24 * 60 * 60 * 1000);
    const result = await this.pool.query('DELETE FROM display_rate_limits WHERE window_start < $1', [oldest]);
    return result.rowCount ?? 0;
  }
}
