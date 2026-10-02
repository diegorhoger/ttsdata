/**
 * Issue #20 — Display authorization lifecycle integration tests (PostgreSQL).
 *
 * These exercise real persistence: encryption at rest, atomic refresh, real job
 * cancellation, disconnect semantics, tenant isolation, and the kill switch.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { CredentialCipher } from '../../src/credential-crypto';
import { DisplayConnectionRepository } from '../../src/repositories/display';
import { DisplayRateLimiter } from '../../src/display/rate-limit';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('Display integration tests require TEST_DATABASE_URL');
if (!new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('Display integration tests require a database name ending in _test');
}

const KEY = Buffer.alloc(32, 7).toString('base64');
const cipher = new CredentialCipher({ '1': KEY }, 1);
const pool = new Pool({ connectionString: DATABASE_URL });
const repository = new DisplayConnectionRepository(pool, cipher);

const ACCESS = 'act.' + 'a'.repeat(48);
const REFRESH = 'rft.' + 'b'.repeat(48);

let workspaceA: string;
let workspaceB: string;
let userA: string;
let userB: string;

async function seedTenant(name: string): Promise<{ workspaceId: string; userId: string }> {
  const workspaceId = randomUUID();
  const userId = randomUUID();
  await pool.query(`INSERT INTO workspaces (id, name, plan_code) VALUES ($1, $2, 'pro')`, [workspaceId, name]);
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, password_hash, role) VALUES ($1, $2, $3, 'x', 'owner')`,
    [userId, workspaceId, `${name}@example.test`],
  );
  return { workspaceId, userId };
}

async function authorize(workspaceId: string, userId: string, account = 'acct-' + randomUUID()) {
  return repository.createConnection({
    workspaceId, userId, providerAccountId: account,
    accessToken: ACCESS, refreshToken: REFRESH,
    scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
    expiresInSeconds: 3600, refreshExpiresInSeconds: 86400,
  });
}

beforeAll(async () => {
  const a = await seedTenant('alpha'); workspaceA = a.workspaceId; userA = a.userId;
  const b = await seedTenant('beta'); workspaceB = b.workspaceId; userB = b.userId;
});

beforeEach(async () => {
  await pool.query(`UPDATE display_capability_controls SET enabled = true WHERE singleton = true`);
});

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE workspace_id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
  await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
  await pool.end();
});

describe('Display credential encryption at rest', () => {
  it('never stores a plaintext credential', async () => {
    const connection = await authorize(workspaceA, userA);
    const row = await pool.query<{ access_token_encrypted: string; refresh_token_encrypted: string }>(
      `SELECT access_token_encrypted, refresh_token_encrypted FROM display_connections WHERE id = $1`,
      [connection.id],
    );
    expect(row.rows[0].access_token_encrypted).not.toContain(ACCESS);
    expect(row.rows[0].refresh_token_encrypted).not.toContain(REFRESH);
    expect(row.rows[0].access_token_encrypted.split('.')).toHaveLength(3);
    expect(row.rows[0].refresh_token_encrypted.split('.')).toHaveLength(3);
  });

  it('rejects a plaintext credential at the database boundary', async () => {
    const connection = await authorize(workspaceA, userA);
    await expect(pool.query(
      `UPDATE display_connections SET access_token_encrypted = 'plaintext-token' WHERE id = $1`,
      [connection.id],
    )).rejects.toThrow();
  });

  it('decrypts credentials only through the audited read path', async () => {
    const connection = await authorize(workspaceA, userA);
    const stored = await repository.readCredentials(workspaceA, userA, connection.id);
    expect(stored.accessToken).toBe(ACCESS);
    expect(stored.refreshToken).toBe(REFRESH);
    const audit = await repository.listAudit(workspaceA, userA);
    expect(audit.some((event) => event.action === 'credential_read')).toBe(true);
  });

  it('binds ciphertext to the tenant so a cross-tenant decrypt fails', async () => {
    const connection = await authorize(workspaceA, userA);
    const row = await pool.query<{ access_token_encrypted: string; access_token_version: number }>(
      `SELECT access_token_encrypted, access_token_version FROM display_connections WHERE id = $1`,
      [connection.id],
    );
    expect(() => cipher.decrypt(row.rows[0].access_token_encrypted, row.rows[0].access_token_version,
      `display:${workspaceB}:${userB}:tiktok_display:${connection.id}`)).toThrow();
  });
});

describe('Display refresh lifecycle', () => {
  it('durably replaces credentials and advances the revision', async () => {
    const connection = await authorize(workspaceA, userA);
    const nextAccess = 'act2.' + 'c'.repeat(48);
    const refreshed = await repository.replaceCredentials({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      accessToken: nextAccess, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
      expiresInSeconds: 7200,
    });
    expect(refreshed.revision).toBe(connection.revision + 1);
    expect(refreshed.lastRefreshedAt).not.toBeNull();
    const stored = await repository.readCredentials(workspaceA, userA, connection.id);
    expect(stored.accessToken).toBe(nextAccess);
  });

  it('rejects a refresh once the refresh credential has expired', async () => {
    const connection = await authorize(workspaceA, userA);
    await pool.query(`UPDATE display_connections SET refresh_expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [connection.id]);
    await expect(repository.replaceCredentials({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      accessToken: ACCESS, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list'], expiresInSeconds: 3600,
    })).rejects.toThrow(/no longer valid/);
  });

  it('refuses to refresh a revoked connection', async () => {
    const connection = await authorize(workspaceA, userA);
    await repository.markRevoked(workspaceA, userA, connection.id);
    await expect(repository.replaceCredentials({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      accessToken: ACCESS, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list'], expiresInSeconds: 3600,
    })).rejects.toThrow(/cannot be refreshed/);
  });

  it('rejects a write carrying an out-of-date revision', async () => {
    const connection = await authorize(workspaceA, userA);
    const newer = 'act-newer.' + 'e'.repeat(48);
    await repository.replaceCredentials({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      accessToken: newer, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list'], expiresInSeconds: 3600,
    });
    // A caller that still holds the pre-refresh revision must not be able to
    // overwrite the newer credentials.
    const stale = await pool.query(
      `UPDATE display_connections SET access_token_encrypted = 'x.y.z', revision = revision + 1
        WHERE workspace_id = $1 AND user_id = $2 AND id = $3 AND revision = $4
        RETURNING id`,
      [workspaceA, userA, connection.id, connection.revision],
    );
    expect(stale.rowCount).toBe(0);
    const stored = await repository.readCredentials(workspaceA, userA, connection.id);
    expect(stored.accessToken).toBe(newer);
  });
});

describe('Display disconnect semantics', () => {
  it('cancels queued jobs, removes credentials, and transitions state', async () => {
    const connection = await authorize(workspaceA, userA);
    await repository.enqueueSyncJob({ workspaceId: workspaceA, userId: userA, connectionId: connection.id, kind: 'profile_sync' });
    await repository.enqueueSyncJob({ workspaceId: workspaceA, userId: userA, connectionId: connection.id, kind: 'video_sync' });
    expect(await repository.countJobs(workspaceA, connection.id, 'queued')).toBe(2);

    const result = await repository.disconnect(workspaceA, userA, connection.id);

    expect(result.cancelledJobs).toBe(2);
    expect(result.connection.status).toBe('disconnected');
    expect(await repository.countJobs(workspaceA, connection.id, 'queued')).toBe(0);
    expect(await repository.countJobs(workspaceA, connection.id, 'cancelled')).toBe(2);

    const row = await pool.query<{ access_token_encrypted: string }>(
      `SELECT access_token_encrypted FROM display_connections WHERE id = $1`, [connection.id],
    );
    expect(row.rows[0].access_token_encrypted).not.toContain(ACCESS);
    await expect(repository.readCredentials(workspaceA, userA, connection.id)).rejects.toThrow(/disconnected/);
  });

  it('prevents new sync work after disconnect', async () => {
    const connection = await authorize(workspaceA, userA);
    await repository.disconnect(workspaceA, userA, connection.id);
    await expect(repository.enqueueSyncJob({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id, kind: 'profile_sync',
    })).rejects.toThrow(/cannot be queued/);
  });

  it('reports a real cancellation count rather than a constant zero', async () => {
    const connection = await authorize(workspaceA, userA);
    expect(await repository.cancelQueuedJobs(workspaceA, connection.id)).toBe(0);
    await repository.enqueueSyncJob({ workspaceId: workspaceA, userId: userA, connectionId: connection.id, kind: 'video_sync' });
    expect(await repository.cancelQueuedJobs(workspaceA, connection.id)).toBe(1);
  });
});

describe('Display tenant isolation', () => {
  it('denies a cross-tenant read', async () => {
    const connection = await authorize(workspaceA, userA);
    expect(await repository.getConnection(workspaceB, userB, connection.id)).toBeNull();
    await expect(repository.readCredentials(workspaceB, userB, connection.id)).rejects.toThrow(/not found/);
  });

  it('denies a cross-tenant mutation', async () => {
    const connection = await authorize(workspaceA, userA);
    await expect(repository.disconnect(workspaceB, userB, connection.id)).rejects.toThrow(/not found/);
    await expect(repository.markRevoked(workspaceB, userB, connection.id)).rejects.toThrow(/not found/);
    const unchanged = await repository.getConnection(workspaceA, userA, connection.id);
    expect(unchanged?.status).toBe('active');
  });

  it('rejects a cross-tenant job reference at the database boundary', async () => {
    const connection = await authorize(workspaceA, userA);
    await expect(pool.query(
      `INSERT INTO display_sync_jobs (workspace_id, user_id, connection_id, kind, status)
       VALUES ($1, $2, $3, 'video_sync', 'queued')`,
      [workspaceB, userB, connection.id],
    )).rejects.toThrow();
  });

  it('does not leak another tenant connection through list', async () => {
    await authorize(workspaceA, userA);
    const visible = await repository.listConnections(workspaceB, userB);
    expect(visible).toHaveLength(0);
  });
});

describe('Display capability and evidence', () => {
  it('refuses every operation while the kill switch is off', async () => {
    await pool.query(`UPDATE display_capability_controls SET enabled = false WHERE singleton = true`);
    await expect(authorize(workspaceA, userA)).rejects.toThrow(/disabled/);
    await pool.query(`UPDATE display_capability_controls SET enabled = true WHERE singleton = true`);
  });

  it('persists sanitized evidence without credential material', async () => {
    const connection = await authorize(workspaceA, userA);
    await repository.recordProbeEvidence({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      operation: 'user_info', succeeded: true, statusCode: 200,
      payload: { display_name: 'someone', open_id: 'abc', follower_count: 120 },
    });
    const rows = await pool.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM display_probe_evidence WHERE workspace_id = $1 AND connection_id = $2`,
      [workspaceA, connection.id],
    );
    expect(rows.rows[0].payload.display_name).toBe('<REDACTED>');
    expect(rows.rows[0].payload.open_id).toBe('<REDACTED>');
    expect(rows.rows[0].payload.follower_count).toBe(120);
  });

  it('rejects evidence that still carries a credential', async () => {
    const connection = await authorize(workspaceA, userA);
    await expect(repository.recordProbeEvidence({
      workspaceId: workspaceA, userId: userA, connectionId: connection.id,
      operation: 'user_info', succeeded: true, statusCode: 200,
      payload: { access_token: ACCESS },
    })).rejects.toThrow(/credential material/);
  });

  it('rejects a Shop scope in the approved-scope gate', async () => {
    await expect(repository.createConnection({
      workspaceId: workspaceA, userId: userA, providerAccountId: 'acct-' + randomUUID(),
      accessToken: ACCESS, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list', 'shop.product.read'],
      expiresInSeconds: 3600,
    })).rejects.toThrow(/Shop capability is not authorized/);
  });

  it('rejects a connection that is missing an approved scope', async () => {
    await expect(repository.createConnection({
      workspaceId: workspaceA, userId: userA, providerAccountId: 'acct-' + randomUUID(),
      accessToken: ACCESS, refreshToken: REFRESH,
      scopes: ['user.info.basic'], expiresInSeconds: 3600,
    })).rejects.toThrow(/Missing required Display scopes/);
  });
});

describe('Display rate limiting (durable)', () => {
  it('enforces a shared limit across limiter instances', async () => {
    const secret = 'rate-limit-secret-value';
    const first = new DisplayRateLimiter(pool, secret);
    const second = new DisplayRateLimiter(pool, secret);
    const subject = 'subject-' + randomUUID();
    for (let index = 0; index < 10; index += 1) {
      const outcome = await first.consume('disconnect', subject);
      expect(outcome.allowed).toBe(true);
    }
    const denied = await second.consume('disconnect', subject);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('never stores a raw subject', async () => {
    const limiter = new DisplayRateLimiter(pool, 'rate-limit-secret-value');
    const subject = 'raw-ip-203-0-113-7';
    await limiter.consume('authorization_start', subject);
    const rows = await pool.query<{ bucket_key: string }>(
      `SELECT bucket_key FROM display_rate_limits ORDER BY updated_at DESC LIMIT 1`,
    );
    expect(rows.rows[0].bucket_key).not.toContain(subject);
    expect(rows.rows[0].bucket_key).toMatch(/^[a-f0-9]{64}$/);
  });
});
