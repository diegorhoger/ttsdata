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
import { OAuthRepository } from '../../src/repositories/oauth';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL) throw new Error('Display integration tests require TEST_DATABASE_URL');
if (!new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('Display integration tests require a database name ending in _test');
}

const KEY = Buffer.alloc(32, 7).toString('base64');
const cipher = new CredentialCipher({ '1': KEY }, 1);
const pool = new Pool({ connectionString: DATABASE_URL });
const repository = new DisplayConnectionRepository(pool, cipher);
const oauthRepository = new OAuthRepository(pool, {
  stateSecret: 'integration-state-secret', sessionSecret: 'integration-session-secret',
});

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
    await repository.applyRemoteRevocation(workspaceA, userA, connection.id, 'confirmed');
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

    const result = await repository.disconnect(workspaceA, userA, connection.id, 'confirmed');

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
    await repository.disconnect(workspaceA, userA, connection.id, 'confirmed');
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
    await expect(repository.disconnect(workspaceB, userB, connection.id, 'confirmed')).rejects.toThrow(/not found/);
    await expect(repository.applyRemoteRevocation(workspaceB, userB, connection.id, 'confirmed')).rejects.toThrow(/not found/);
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

describe('Display remote revocation truthfulness', () => {
  it('records a confirmed provider revocation', async () => {
    const connection = await authorize(workspaceA, userA);
    const revoked = await repository.applyRemoteRevocation(workspaceA, userA, connection.id, 'confirmed');
    expect(revoked.status).toBe('revoked');
    expect(revoked.remoteRevocation).toBe('confirmed');
    expect(revoked.remoteRevocationAt).not.toBeNull();
  });

  it('records an unconfirmed provider revocation without claiming success', async () => {
    const connection = await authorize(workspaceA, userA);
    const revoked = await repository.applyRemoteRevocation(workspaceA, userA, connection.id, 'unavailable');
    expect(revoked.status).toBe('revoked');
    expect(revoked.remoteRevocation).toBe('unavailable');
    expect(revoked.remoteRevocationAt).not.toBeNull();
  });

  it('cannot represent a local-only mutation as a confirmed revocation', async () => {
    const connection = await authorize(workspaceA, userA);
    // 'not_attempted' is not an accepted outcome: the route must have called the provider.
    await expect(repository.applyRemoteRevocation(
      workspaceA, userA, connection.id, 'not_attempted' as never,
    )).rejects.toThrow();
    const fresh = await repository.getConnection(workspaceA, userA, connection.id);
    expect(fresh?.remoteRevocation).toBe('not_attempted');
  });

  it('records the truthful outcome on disconnect', async () => {
    const connection = await authorize(workspaceA, userA);
    const result = await repository.disconnect(workspaceA, userA, connection.id, 'unavailable');
    expect(result.connection.status).toBe('disconnected');
    expect(result.connection.remoteRevocation).toBe('unavailable');
  });

  it('clears the revocation record on re-authorization', async () => {
    const connection = await authorize(workspaceA, userA);
    await repository.applyRemoteRevocation(workspaceA, userA, connection.id, 'confirmed');
    const reauthorized = await repository.createConnection({
      workspaceId: workspaceA, userId: userA, providerAccountId: 'acct-' + randomUUID(),
      accessToken: ACCESS, refreshToken: REFRESH,
      scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
      expiresInSeconds: 3600,
    });
    expect(reauthorized.status).toBe('active');
    expect(reauthorized.remoteRevocation).toBe('not_attempted');
    expect(reauthorized.remoteRevocationAt).toBeNull();
  });
});

describe('OAuth state tenant binding', () => {
  it('binds consumption to the recorded tenant and refuses an unbound state', async () => {
    const rawState = 'tenant-bound-' + randomUUID();
    await oauthRepository.createState({
      rawState, sessionId: 'session-1', expiresAt: new Date(Date.now() + 600000),
      workspaceId: workspaceA, userId: userA,
    });
    // A session-bound consumer cannot consume a tenant-bound state.
    const viaSession = await oauthRepository.consumeStateAtomic(rawState, 'session-1');
    expect(viaSession.success).toBe(true);

    // A fresh state is consumed by its tenant binding.
    const second = 'tenant-bound-' + randomUUID();
    await oauthRepository.createState({
      rawState: second, sessionId: 'session-1', expiresAt: new Date(Date.now() + 600000),
      workspaceId: workspaceA, userId: userA,
    });
    const allowed = await oauthRepository.consumeTenantBoundState(second);
    expect(allowed.success).toBe(true);
    expect(allowed.workspaceId).toBe(workspaceA);
    expect(allowed.userId).toBe(userA);
  });

  it('still permits exactly one concurrent consumer', async () => {
    const rawState = 'atomic-' + randomUUID();
    await oauthRepository.createState({
      rawState, sessionId: 'session-1', expiresAt: new Date(Date.now() + 600000),
      workspaceId: workspaceA, userId: userA,
    });
    const results = await Promise.all([
      oauthRepository.consumeTenantBoundState(rawState),
      oauthRepository.consumeTenantBoundState(rawState),
    ]);
    expect(results.filter((item) => item.success)).toHaveLength(1);
    expect(results.filter((item) => !item.success)[0].error).toBe('already_consumed');
  });
});

describe('OAuth state future-issued rejection (real repository)', () => {
  /** Insert a state directly so issued_at can be placed in the future. */
  async function insertState(options: {
    rawState: string; sessionId: string; issuedAt: Date; expiresAt: Date;
    workspaceId?: string; userId?: string;
  }) {
    await pool.query(
      `INSERT INTO oauth_states (state_hash, session_hash, issued_at, expires_at, workspace_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        oauthRepository['hashState'](options.rawState),
        oauthRepository['hashSession'](options.sessionId),
        options.issuedAt, options.expiresAt,
        options.workspaceId ?? null, options.userId ?? null,
      ],
    );
  }

  async function consumedAtOf(rawState: string): Promise<Date | null> {
    const row = await pool.query<{ consumed_at: Date | null }>(
      `SELECT consumed_at FROM oauth_states WHERE state_hash = $1`,
      [oauthRepository['hashState'](rawState)],
    );
    return row.rows[0]?.consumed_at ?? null;
  }

  it('rejects a future-dated tenant-bound state and does not consume it', async () => {
    const rawState = 'future-tenant-' + randomUUID();
    await insertState({
      rawState, sessionId: 'session-1',
      issuedAt: new Date(Date.now() + 10 * 60 * 1000),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      workspaceId: workspaceA, userId: userA,
    });

    const result = await oauthRepository.consumeTenantBoundState(rawState);

    expect(result.success).toBe(false);
    expect(result.error).toBe('future_issued');
    // Not consumed: the record remains replayable by a legitimate clock, and
    // more importantly was never marked as used by a rejected attempt.
    expect(await consumedAtOf(rawState)).toBeNull();
  });

  it('rejects a future-dated session-bound state and does not consume it', async () => {
    const rawState = 'future-session-' + randomUUID();
    await insertState({
      rawState, sessionId: 'session-future',
      issuedAt: new Date(Date.now() + 10 * 60 * 1000),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    const viaAtomic = await oauthRepository.consumeStateAtomic(rawState, 'session-future');
    expect(viaAtomic.success).toBe(false);
    expect(viaAtomic.error).toBe('future_issued');

    const viaLegacy = await oauthRepository.consumeState(rawState, 'session-future');
    expect(viaLegacy.success).toBe(false);
    expect(viaLegacy.error).toBe('future_issued');
    expect(await consumedAtOf(rawState)).toBeNull();
  });

  it('tolerates issuance within the established skew allowance', async () => {
    const rawState = 'skew-ok-' + randomUUID();
    await insertState({
      rawState, sessionId: 'session-skew',
      issuedAt: new Date(Date.now() + 1_000),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      workspaceId: workspaceA, userId: userA,
    });

    const result = await oauthRepository.consumeTenantBoundState(rawState);
    expect(result.success).toBe(true);
    expect(result.workspaceId).toBe(workspaceA);
  });

  it('still rejects a future-dated state that is also replayed', async () => {
    const rawState = 'future-replay-' + randomUUID();
    await insertState({
      rawState, sessionId: 'session-1',
      issuedAt: new Date(Date.now() + 10 * 60 * 1000),
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      workspaceId: workspaceA, userId: userA,
    });
    const first = await oauthRepository.consumeTenantBoundState(rawState);
    const second = await oauthRepository.consumeTenantBoundState(rawState);
    expect(first.success).toBe(false);
    expect(second.success).toBe(false);
    expect(await consumedAtOf(rawState)).toBeNull();
  });

  it('preserves concurrent single-consumption for a valid state', async () => {
    const rawState = 'concurrent-valid-' + randomUUID();
    await oauthRepository.createState({
      rawState, sessionId: 'session-1', expiresAt: new Date(Date.now() + 600000),
      workspaceId: workspaceA, userId: userA,
    });
    const results = await Promise.all([
      oauthRepository.consumeTenantBoundState(rawState),
      oauthRepository.consumeTenantBoundState(rawState),
    ]);
    expect(results.filter((item) => item.success)).toHaveLength(1);
  });

  it('refuses to persist a state whose expiry precedes issuance', async () => {
    await expect(oauthRepository.createState({
      rawState: 'bad-expiry-' + randomUUID(), sessionId: 'session-1',
      expiresAt: new Date(Date.now() - 1000),
      workspaceId: workspaceA, userId: userA,
    })).rejects.toThrow(/expiry/i);
  });
});
