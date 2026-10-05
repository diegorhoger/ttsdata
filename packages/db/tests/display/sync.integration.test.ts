/**
 * Display sync integration tests — Issue #21.
 *
 * Real PostgreSQL integration tests for the Display synchronization service.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DisplaySyncService } from '../../src/display/sync';
import { DisplayApiAdapter } from '../../src/display/adapter';
import { CredentialCipher } from '../../src/credential-crypto';
import { DisplayConnectionRepository } from '../../src/repositories/display';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('Display sync integration tests require TEST_DATABASE_URL');

const KEY = Buffer.alloc(32, 7).toString('base64');
const cipher = new CredentialCipher({ '1': KEY }, 1);
const testCipher = new CredentialCipher({ '1': Buffer.alloc(32, 1).toString('base64') }, 1);

async function seedTenant(name: string): Promise<{ workspaceId: string; userId: string }> {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  const pool = new Pool({ connectionString: DATABASE_URL });
  await pool.query(`INSERT INTO workspaces (id, name, plan_code) VALUES ($1, $2, 'pro')`, [workspaceId, name]);
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, password_hash, role) VALUES ($1, $2, $3, 'x', 'owner')`,
    [userId, workspaceId, `${name}@example.test`],
  );
  await pool.end();
  return { workspaceId, userId };
}

describe('DisplaySyncService integration', () => {
  let pool: Pool;
  let service: DisplaySyncService;
  let repository: DisplayConnectionRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    repository = new DisplayConnectionRepository(pool, testCipher, false);
    service = new DisplaySyncService({
      pool,
      cipher: testCipher,
      adapter: new DisplayApiAdapter(),
      repository,
      config: {
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        stateSecret: 'x'.repeat(32),
        sessionSecret: 'y'.repeat(32),
        resultSecret: 'z'.repeat(32),
        canonicalOrigin: 'http://localhost:3000',
      },
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('schema tables exist', async () => {
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'display_%'`
    );
    const tables = result.rows.map((r) => r.table_name);
    expect(tables).toContain('display_profiles');
    expect(tables).toContain('display_profile_snapshots');
    expect(tables).toContain('display_videos');
    expect(tables).toContain('display_video_snapshots');
    expect(tables).toContain('display_metric_provenance');
    expect(tables).toContain('display_sync_runs');
  });

  it('syncProfile idempotently upserts', async () => {
    const { workspaceId, userId } = await seedTenant('sync-test');
    const connectionId = randomUUID();

    await pool.query(
      `INSERT INTO display_connections
       (id, workspace_id, user_id, provider, provider_account_hash,
        access_token_encrypted, access_token_version, refresh_token_encrypted,
        refresh_token_version, access_token_fingerprint, refresh_token_fingerprint,
        scopes, status, authorized_at, expires_at)
       VALUES ($1, $2, $3, 'tiktok_display', $4, 'encrypted', 1, 'encrypted', 1,
               'sha256:abc123...', 'sha256:def456...',
               '["user.info.basic","user.info.stats","video.list"]'::jsonb, 'active',
               NOW(), NOW() + INTERVAL '1 hour')`,
      [connectionId, workspaceId, userId, 'a'.repeat(64)]
    );

    // First sync
    const result1 = await service.syncProfile(workspaceId, userId, connectionId);
    expect(result1.status).toBe('succeeded');

    // Second sync with same data
    const result2 = await service.syncProfile(workspaceId, userId, connectionId);
    expect(result2.status).toBe('succeeded');

    // Should have exactly 2 snapshots (one per sync)
    const snapshots = await pool.query(
      `SELECT COUNT(*) FROM display_profile_snapshots
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3`,
      [workspaceId, userId, connectionId]
    );
    expect(parseInt(snapshots.rows[0].count)).toBe(2);
  });
});
