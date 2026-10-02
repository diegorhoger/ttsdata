/**
 * Issue #20 — Display route tests.
 *
 * Covers authz, tenant derivation, secret non-leakage in responses, kill-switch
 * mapping, rate-limit enforcement, and strict payload rejection.
 */

import Fastify, { type FastifyReply, type FastifyRequest } from '../../apps/api/node_modules/fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerDisplayRoutes, type DisplayRouteOptions } from '../../apps/api/src/routes/display';
import { errorHandler } from '../../apps/api/src/lib/errors';
import {
  DisplayCapabilityDisabledError,
  DisplayConnectionNotFoundError,
  DisplayConnectionStateError,
  DisplayCredentialExpiredError,
} from '../../packages/db/src/repositories/display';
import { CapabilityError } from '../../packages/db/src/display/capability';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const CONNECTION_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-02T12:00:00.000Z');
const ACCESS_TOKEN = 'act.' + 'z'.repeat(48);
const REFRESH_TOKEN = 'rft.' + 'y'.repeat(48);

const connection = {
  id: CONNECTION_ID, workspaceId: WORKSPACE_ID, userId: USER_ID, provider: 'tiktok_display',
  providerAccountHash: 'a'.repeat(64), scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
  status: 'active' as const, revision: 1, authorizedAt: NOW, expiresAt: NOW,
  refreshExpiresAt: NOW, lastRefreshedAt: null, lastSyncAt: null,
  revokedAt: null, disconnectedAt: null, createdAt: NOW, updatedAt: NOW,
};

function createRepository() {
  return {
    listConnections: vi.fn().mockResolvedValue([connection]),
    getConnection: vi.fn().mockResolvedValue(connection),
    createConnection: vi.fn().mockResolvedValue(connection),
    replaceCredentials: vi.fn().mockResolvedValue({ ...connection, revision: 2 }),
    markRevoked: vi.fn().mockResolvedValue({ ...connection, status: 'revoked', revokedAt: NOW }),
    disconnect: vi.fn().mockResolvedValue({ connection: { ...connection, status: 'disconnected', disconnectedAt: NOW }, cancelledJobs: 3 }),
    enqueueSyncJob: vi.fn().mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666' }),
    countJobs: vi.fn().mockResolvedValue(2),
    recordAudit: vi.fn().mockResolvedValue(undefined),
    listAudit: vi.fn().mockResolvedValue([{ action: 'disconnect', outcome: 'success', metadata: {}, createdAt: NOW }]),
    recordProbeEvidence: vi.fn().mockResolvedValue(undefined),
    listProbeEvidence: vi.fn().mockResolvedValue([{ operation: 'user_info', succeeded: true, payload: {}, observedAt: NOW }]),
  };
}

function createLimiter(allowed = true) {
  return { consume: vi.fn().mockResolvedValue({ allowed, remaining: allowed ? 5 : 0, retryAfterSeconds: allowed ? 0 : 30 }) };
}

async function buildApp(
  repository: ReturnType<typeof createRepository>,
  role: 'owner' | 'admin' | 'analyst' | 'viewer' = 'owner',
  limiter = createLimiter(),
) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    request.auth = { userId: USER_ID, workspaceId: WORKSPACE_ID, email: 'creator@example.test', role, planCode: 'beta' };
  };
  await app.register(registerDisplayRoutes, {
    prefix: '/api/display',
    repository: repository as unknown as DisplayRouteOptions['repository'],
    rateLimiter: limiter as unknown as DisplayRouteOptions['rateLimiter'],
    authenticate,
  });
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe('Display connection reads', () => {
  it('derives the tenant from the authenticated context', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/display/connections' });
    expect(response.statusCode).toBe(200);
    expect(repository.listConnections).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
  });

  it('never serializes a credential in a connection view', async () => {
    const repository = createRepository();
    repository.getConnection.mockResolvedValueOnce({
      ...connection, accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
    } as never);
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: `/api/display/connections/${CONNECTION_ID}` });
    const body = response.body;
    expect(response.statusCode).toBe(200);
    expect(body).not.toContain(ACCESS_TOKEN);
    expect(body).not.toContain(REFRESH_TOKEN);
    expect(body).not.toContain('accessToken');
    expect(body).not.toContain('refreshToken');
    expect(body).not.toContain('encrypted');
    expect(body).not.toContain('providerAccountHash');
  });

  it('fails closed on a connection from another tenant', async () => {
    const repository = createRepository();
    repository.getConnection.mockResolvedValueOnce(null);
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: `/api/display/connections/${CONNECTION_ID}` });
    expect(response.statusCode).toBe(404);
    expect(repository.getConnection).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID);
  });

  it('rejects a malformed connection identifier before repository access', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/display/connections/not-a-uuid' });
    expect(response.statusCode).toBe(400);
    expect(repository.getConnection).not.toHaveBeenCalled();
  });

  it('lets viewers read but not mutate', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);
    const read = await app.inject({ method: 'GET', url: '/api/display/connections' });
    const write = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {},
    });
    expect(read.statusCode).toBe(200);
    expect(write.statusCode).toBe(403);
    expect(repository.disconnect).not.toHaveBeenCalled();
  });
});

describe('Display lifecycle mutations', () => {
  it('records a new connection with the authenticated tenant only', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/connections',
      payload: {
        providerAccountId: 'provider-account', accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        scopes: ['user.info.basic', 'user.info.stats', 'video.list'], expiresInSeconds: 3600,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(repository.createConnection).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID, providerAccountId: 'provider-account',
    }));
    expect(response.body).not.toContain(ACCESS_TOKEN);
  });

  it('rejects a client-supplied workspace or user identifier', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/connections',
      payload: {
        providerAccountId: 'a', accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        scopes: ['user.info.basic'], expiresInSeconds: 3600, workspaceId: 'attacker',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('refreshes credentials and audits the success', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`,
      payload: {
        accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        scopes: ['user.info.basic', 'user.info.stats', 'video.list'], expiresInSeconds: 3600,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.replaceCredentials).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID, connectionId: CONNECTION_ID,
    }));
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'token_refresh', outcome: 'success' }));
    expect(response.body).not.toContain(ACCESS_TOKEN);
  });

  it('maps a refresh failure to a stable error and audits the failure', async () => {
    const repository = createRepository();
    repository.replaceCredentials.mockRejectedValueOnce(new Error('boom'));
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`,
      payload: { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, scopes: ['user.info.basic'], expiresInSeconds: 3600 },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(ACCESS_TOKEN);
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'token_refresh', outcome: 'failure' }));
  });

  it('maps an expired refresh credential to 409', async () => {
    const repository = createRepository();
    repository.replaceCredentials.mockRejectedValueOnce(new DisplayCredentialExpiredError());
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`,
      payload: { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, scopes: ['user.info.basic'], expiresInSeconds: 3600 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'CREDENTIAL_EXPIRED' });
  });

  it('disconnects and reports the real cancellation count', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ cancelledJobs: 3 });
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'disconnect' }));
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync_cancel' }));
  });

  it('revokes a connection', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/revoke`, payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(repository.markRevoked).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID);
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'token_revoke', outcome: 'success' }));
  });

  it('enqueues and reports sync jobs', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const created = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/jobs`, payload: { kind: 'video_sync' },
    });
    const counted = await app.inject({ method: 'GET', url: `/api/display/connections/${CONNECTION_ID}/jobs` });
    expect(created.statusCode).toBe(201);
    expect(counted.statusCode).toBe(200);
    expect(repository.enqueueSyncJob).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video_sync', workspaceId: WORKSPACE_ID }));
  });

  it('rejects an unapproved job kind', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/jobs`, payload: { kind: 'shop_sync' },
    });
    expect(response.statusCode).toBe(400);
    expect(repository.enqueueSyncJob).not.toHaveBeenCalled();
  });
});

describe('Display kill switch, capability, and rate limits', () => {
  it('maps the kill switch to 503', async () => {
    const repository = createRepository();
    repository.listConnections.mockRejectedValueOnce(new DisplayCapabilityDisabledError());
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/display/connections' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'CAPABILITY_DISABLED' });
  });

  it('maps a capability violation to 400', async () => {
    const repository = createRepository();
    repository.createConnection.mockRejectedValueOnce(new CapabilityError('Shop capability is not authorized by this node: shop.x'));
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/connections',
      payload: {
        providerAccountId: 'a', accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        scopes: ['user.info.basic'], expiresInSeconds: 3600,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'CAPABILITY_VIOLATION' });
  });

  it('maps an invalid state to 409', async () => {
    const repository = createRepository();
    repository.disconnect.mockRejectedValueOnce(new DisplayConnectionStateError('Display connection is revoked'));
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {},
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_STATE' });
  });

  it('maps a missing connection to 404', async () => {
    const repository = createRepository();
    repository.markRevoked.mockRejectedValueOnce(new DisplayConnectionNotFoundError());
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/revoke`, payload: {},
    });
    expect(response.statusCode).toBe(404);
  });

  it('enforces the rate limit on lifecycle mutations', async () => {
    const repository = createRepository();
    const limiter = createLimiter(false);
    const app = await buildApp(repository, 'owner', limiter);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {},
    });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({ error: 'RATE_LIMITED' });
    expect(repository.disconnect).not.toHaveBeenCalled();
  });

  it('exposes sanitized audit and evidence without credentials', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const audit = await app.inject({ method: 'GET', url: '/api/display/audit' });
    const evidence = await app.inject({ method: 'GET', url: '/api/display/evidence' });
    expect(audit.statusCode).toBe(200);
    expect(evidence.statusCode).toBe(200);
    expect(audit.body).not.toContain('accessToken');
    expect(evidence.body).not.toContain('accessToken');
  });

  it('stores sanitized evidence through the API', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/evidence',
      payload: { operation: 'user_info', succeeded: true, statusCode: 200, payload: { follower_count: 12 } },
    });
    expect(response.statusCode).toBe(201);
    expect(repository.recordProbeEvidence).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID, operation: 'user_info',
    }));
  });
});
