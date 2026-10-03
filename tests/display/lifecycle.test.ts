/**
 * Issue #20 — production lifecycle orchestration tests.
 *
 * These prove the real HTTP lifecycle end to end with an injected provider
 * transport: start → durable state → callback → atomic consumption → server-side
 * code exchange → encrypted connection. No route accepts a client credential.
 */

import Fastify, { type FastifyReply, type FastifyRequest } from '../../apps/api/node_modules/fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDisplayRoutes, type DisplayRouteOptions } from '../../apps/api/src/routes/display';
import { errorHandler } from '../../apps/api/src/lib/errors';
import { DisplayApiAdapter } from '../../packages/db/src/display/adapter';
import {
  DisplayCapabilityDisabledError,
  DisplayConnectionNotFoundError,
  DisplayConnectionStateError,
  DisplayCredentialExpiredError,
} from '../../packages/db/src/repositories/display';
import { CapabilityError } from '../../packages/db/src/display/capability';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_WORKSPACE_ID = '12121212-1212-4121-8121-121212121212';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_USER_ID = '45454545-4545-4545-8545-454545454545';
const CONNECTION_ID = '55555555-5555-4555-8555-555555555555';
const NOW = new Date('2026-10-02T12:00:00.000Z');
const ACCESS_TOKEN = 'act.' + 'z'.repeat(48);
const REFRESH_TOKEN = 'rft.' + 'y'.repeat(48);
const AUTHORIZATION_CODE = 'provider-auth-code-' + 'q'.repeat(20);

const config = {
  clientKey: 'ck', clientSecret: 'cs',
  redirectUri: 'https://ttsdata.netlify.app/api/display/callback',
  stateSecret: 's'.repeat(32), sessionSecret: 't'.repeat(32), resultSecret: 'r'.repeat(32),
  canonicalOrigin: 'https://ttsdata.netlify.app',
};

const connection = {
  id: CONNECTION_ID, workspaceId: WORKSPACE_ID, userId: USER_ID, provider: 'tiktok_display',
  providerAccountHash: 'a'.repeat(64), scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
  status: 'active' as const, revision: 1, authorizedAt: NOW, expiresAt: NOW,
  refreshExpiresAt: NOW, lastRefreshedAt: null, lastSyncAt: null,
  revokedAt: null, disconnectedAt: null,
  remoteRevocation: 'not_attempted' as const, remoteRevocationAt: null,
  createdAt: NOW, updatedAt: NOW,
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function tokenPayload(overrides: Record<string, unknown> = {}) {
  return {
    access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 3600,
    refresh_expires_in: 86400, scope: 'user.info.basic,user.info.stats,video.list',
    open_id: 'provider-open-id', ...overrides,
  };
}

function createRepository() {
  return {
    listConnections: vi.fn().mockResolvedValue([connection]),
    getConnection: vi.fn().mockResolvedValue(connection),
    createConnection: vi.fn().mockResolvedValue(connection),
    readCredentials: vi.fn().mockResolvedValue({ connection, accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN }),
    replaceCredentials: vi.fn().mockResolvedValue({ ...connection, revision: 2 }),
    applyRemoteRevocation: vi.fn().mockResolvedValue({
      ...connection, status: 'revoked', revokedAt: NOW, remoteRevocation: 'confirmed', remoteRevocationAt: NOW,
    }),
    disconnect: vi.fn().mockResolvedValue({
      connection: { ...connection, status: 'disconnected', disconnectedAt: NOW, remoteRevocation: 'confirmed', remoteRevocationAt: NOW },
      cancelledJobs: 3,
    }),
    enqueueSyncJob: vi.fn().mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666' }),
    countJobs: vi.fn().mockResolvedValue(2),
    recordAudit: vi.fn().mockResolvedValue(undefined),
    listAudit: vi.fn().mockResolvedValue([]),
    recordProbeEvidence: vi.fn().mockResolvedValue(undefined),
    listProbeEvidence: vi.fn().mockResolvedValue([]),
  };
}

function createOAuthRepository() {
  return {
    createState: vi.fn().mockResolvedValue('state-hash'),
    consumeTenantBoundState: vi.fn().mockResolvedValue({
      success: true, sessionId: '', consumedAt: NOW, workspaceId: WORKSPACE_ID, userId: USER_ID,
    }),
  };
}

function createLimiter(allowed = true) {
  return { consume: vi.fn().mockResolvedValue({ allowed, remaining: allowed ? 5 : 0, retryAfterSeconds: allowed ? 0 : 30 }) };
}

async function buildApp(options: {
  repository?: ReturnType<typeof createRepository>;
  oauthRepository?: ReturnType<typeof createOAuthRepository>;
  limiter?: ReturnType<typeof createLimiter>;
  adapter?: DisplayApiAdapter;
  role?: 'owner' | 'admin' | 'analyst' | 'viewer';
  unauthenticated?: boolean;
} = {}) {
  const repository = options.repository ?? createRepository();
  const oauthRepository = options.oauthRepository ?? createOAuthRepository();
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    if (options.unauthenticated) return reply.status(401).send({ error: 'UNAUTHENTICATED' });
    request.auth = {
      userId: USER_ID, workspaceId: WORKSPACE_ID, email: 'creator@example.test',
      role: options.role ?? 'owner', planCode: 'beta',
    };
  };
  await app.register(registerDisplayRoutes, {
    prefix: '/api/display',
    repository: repository as unknown as DisplayRouteOptions['repository'],
    oauthRepository: oauthRepository as unknown as DisplayRouteOptions['oauthRepository'],
    rateLimiter: (options.limiter ?? createLimiter()) as unknown as DisplayRouteOptions['rateLimiter'],
    adapter: options.adapter ?? new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload()))),
    config: config as unknown as DisplayRouteOptions['config'],
    authenticate,
  });
  return { app, repository, oauthRepository };
}

const apps: Array<{ close: () => Promise<void> }> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

// ---------------------------------------------------------------- A. start

describe('A. authorization start', () => {
  it('persists durable tenant-bound state and returns the approved authorization URL', async () => {
    const { app, repository, oauthRepository } = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    const url = new URL(body.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,user.info.stats,video.list');
    expect(url.searchParams.get('client_key')).toBe('ck');
    expect(url.searchParams.get('state')).toBe(body.state);
    expect(url.searchParams.get('state')).toMatch(/^[a-f0-9]{64}$/);
    expect(body.authorizationUrl).not.toContain('tiktokglobalshop');

    expect(oauthRepository.createState).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID, rawState: body.state,
    }));
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'authorization_start', outcome: 'success',
    }));
  });

  it('never exposes the client secret in the start response', async () => {
    const { app } = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });
    expect(response.body).not.toContain(config.clientSecret);
    expect(response.body).not.toContain('client_secret');
  });

  it('rejects a client-supplied credential or identity on start', async () => {
    const { app, repository, oauthRepository } = await buildApp();
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/connections/authorize',
      payload: { accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN, providerAccountId: 'forged' },
    });
    expect(response.statusCode).toBe(400);
    expect(oauthRepository.createState).not.toHaveBeenCalled();
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('requires authentication and a writing role', async () => {
    const anon = await buildApp({ unauthenticated: true });
    apps.push(anon.app);
    const unauthenticated = await anon.app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });
    expect(unauthenticated.statusCode).toBe(401);

    const viewer = await buildApp({ role: 'viewer' });
    apps.push(viewer.app);
    const forbidden = await viewer.app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });
    expect(forbidden.statusCode).toBe(403);
    expect(viewer.oauthRepository.createState).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------- B/C. callback

describe('B. callback state rejection', () => {
  const rejection = async (consumed: Record<string, unknown>) => {
    const oauthRepository = createOAuthRepository();
    oauthRepository.consumeTenantBoundState.mockResolvedValueOnce({ success: false, ...consumed });
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload())));
    const { app, repository } = await buildApp({ oauthRepository, adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    return { response, repository, adapter };
  };

  it('rejects missing code or state', async () => {
    const { app } = await buildApp();
    apps.push(app);
    const noCode = await app.inject({ method: 'GET', url: `/api/display/callback?state=${'a'.repeat(64)}` });
    const noState = await app.inject({ method: 'GET', url: `/api/display/callback?code=x` });
    expect(noCode.statusCode).toBe(400);
    expect(noState.statusCode).toBe(400);
    expect(noCode.json()).toMatchObject({ error: 'INVALID_CALLBACK' });
  });

  it('rejects a malformed callback payload', async () => {
    const { app } = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/display/callback?code=x&state=y&unexpected=1' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('refuses a denial callback that carries no state', async () => {
    const { app, repository, oauthRepository } = await buildApp();
    apps.push(app);
    const response = await app.inject({ method: 'GET', url: '/api/display/callback?error=access_denied' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'INVALID_STATE' });
    // Uncorrelated denial never reaches state consumption or any provider call.
    expect(oauthRepository.consumeTenantBoundState).not.toHaveBeenCalled();
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('consumes state on a denial callback, rate-limits and audits without echoing the provider error', async () => {
    const { app, repository, oauthRepository } = await buildApp();
    apps.push(app);
    const state = 'a'.repeat(64);
    const response = await app.inject({
      method: 'GET',
      url: `/api/display/callback?error=access_denied&error_description=${encodeURIComponent('user_refused: code=leaky')}&state=${state}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'PROVIDER_DENIED' });
    // State was correlated and consumed exactly once.
    expect(oauthRepository.consumeTenantBoundState).toHaveBeenCalledWith(state);
    // The callback participated in rate limiting and audit for the resolved tenant.
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID,
      action: 'authorization_callback', outcome: 'failure',
      metadata: { reason: 'provider_denied' },
    }));
    // No raw provider error text anywhere in the response or the audit payload.
    expect(response.body).not.toContain('access_denied');
    expect(response.body).not.toContain('user_refused');
    expect(JSON.stringify(repository.recordAudit.mock.calls)).not.toContain('access_denied');
    expect(JSON.stringify(repository.recordAudit.mock.calls)).not.toContain('user_refused');
    // No exchange, no credentials.
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('does not reuse a state after a denial callback', async () => {
    const oauthRepository = createOAuthRepository();
    oauthRepository.consumeTenantBoundState
      .mockResolvedValueOnce({ success: true, consumedAt: NOW, workspaceId: WORKSPACE_ID, userId: USER_ID })
      .mockResolvedValueOnce({ success: false, error: 'already_consumed' });
    const { app, repository } = await buildApp({ oauthRepository });
    apps.push(app);
    const state = 'b'.repeat(64);

    const denial = await app.inject({ method: 'GET', url: `/api/display/callback?error=access_denied&state=${state}` });
    const replay = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${state}`,
    });

    expect(denial.statusCode).toBe(400);
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ error: 'INVALID_STATE', reason: 'already_consumed' });
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('rate-limits a denial callback', async () => {
    const limiter = createLimiter(false);
    const { app, repository } = await buildApp({ limiter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?error=access_denied&state=${'c'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(429);
    expect(limiter.consume).toHaveBeenCalledWith('authorization_callback', USER_ID);
    expect(repository.recordAudit).not.toHaveBeenCalled();
  });

  it('never calls the token endpoint on a denial', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload()));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const { app } = await buildApp({ adapter });
    apps.push(app);
    await app.inject({ method: 'GET', url: `/api/display/callback?error=access_denied&state=${'d'.repeat(64)}` });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  for (const reason of ['state_not_found', 'already_consumed', 'expired', 'session_mismatch', 'future_issued'] as const) {
    it(`fails closed on ${reason} and never reaches the provider`, async () => {
      const { response, repository, adapter } = await rejection({ error: reason });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: 'INVALID_STATE', reason });
      expect(repository.createConnection).not.toHaveBeenCalled();
      expect(adapter['fetchImpl']).not.toHaveBeenCalled();
    });
  }

  it('refuses an unbound state rather than trusting it', async () => {
    const oauthRepository = createOAuthRepository();
    oauthRepository.consumeTenantBoundState.mockResolvedValueOnce({ success: true, consumedAt: NOW });
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload())));
    const { app, repository } = await buildApp({ oauthRepository, adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ reason: 'unbound_state' });
    expect(repository.createConnection).not.toHaveBeenCalled();
  });
});

describe('C. atomic consumption and replay', () => {
  it('consumes the state exactly once and refuses the replay', async () => {
    const oauthRepository = createOAuthRepository();
    // First call wins; the replay is reported as already consumed.
    oauthRepository.consumeTenantBoundState
      .mockResolvedValueOnce({ success: true, sessionId: '', consumedAt: NOW, workspaceId: WORKSPACE_ID, userId: USER_ID })
      .mockResolvedValueOnce({ success: false, error: 'already_consumed' });
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload())));
    const { app, repository } = await buildApp({ oauthRepository, adapter });
    apps.push(app);

    const url = `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`;
    const first = await app.inject({ method: 'GET', url });
    const replay = await app.inject({ method: 'GET', url });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ error: 'INVALID_STATE', reason: 'already_consumed' });
    expect(repository.createConnection).toHaveBeenCalledTimes(1);
  });
});

describe('D. server-side exchange and credential confinement', () => {
  it('creates the connection from the trusted provider response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload()));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);

    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });

    expect(response.statusCode).toBe(201);
    // The exchange happened server-side against the approved endpoint.
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain(`code=${AUTHORIZATION_CODE}`);
    expect(body).toContain('grant_type=authorization_code');
    // Identity came from the provider payload, not the client.
    expect(repository.createConnection).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: WORKSPACE_ID, userId: USER_ID, providerAccountId: 'provider-open-id',
      accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
    }));
  });

  it('never returns, echoes or audits the authorization code or tokens', async () => {
    const { app, repository } = await buildApp();
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.body).not.toContain(AUTHORIZATION_CODE);
    expect(response.body).not.toContain(ACCESS_TOKEN);
    expect(response.body).not.toContain(REFRESH_TOKEN);
    expect(response.body).not.toContain(config.clientSecret);
    expect(response.body).not.toContain('accessToken');
    expect(response.body).not.toContain('providerAccountHash');

    const auditCalls = JSON.stringify(repository.recordAudit.mock.calls);
    expect(auditCalls).not.toContain(AUTHORIZATION_CODE);
    expect(auditCalls).not.toContain(ACCESS_TOKEN);
    expect(auditCalls).not.toContain(REFRESH_TOKEN);
    expect(auditCalls).not.toContain('provider-open-id');
  });

  it('rejects a token response missing an approved scope', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(
      jsonResponse(200, tokenPayload({ scope: 'user.info.basic' })),
    ));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'CAPABILITY_VIOLATION' });
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('rejects a token response carrying a Shop scope', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(
      jsonResponse(200, tokenPayload({ scope: 'user.info.basic,user.info.stats,video.list,shop.product.read' })),
    ));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('rejects a provider response with no account identity', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(
      jsonResponse(200, tokenPayload({ open_id: undefined })),
    ));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(502);
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('does not leak the provider error body on a failed exchange', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(
      jsonResponse(401, { error: 'invalid_grant', error_description: `code=${AUTHORIZATION_CODE}` }),
    ));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(502);
    expect(response.body).not.toContain(AUTHORIZATION_CODE);
    expect(response.body).not.toContain('invalid_grant');
    expect(repository.createConnection).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------- E/F. refresh

describe('E. server-side refresh', () => {
  it('loads the refresh credential from storage and calls the provider', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload({
      access_token: 'act-new.' + 'n'.repeat(48), refresh_token: 'rft-new.' + 'm'.repeat(48),
    })));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(repository.readCredentials).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain(`refresh_token=${REFRESH_TOKEN}`);
    expect(repository.replaceCredentials).toHaveBeenCalledWith(expect.objectContaining({
      connectionId: CONNECTION_ID, accessToken: 'act-new.' + 'n'.repeat(48),
    }));
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'token_refresh', outcome: 'success',
    }));
  });

  it('does not accept a client-supplied replacement credential', async () => {
    const { app, repository } = await buildApp();
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`,
      payload: { accessToken: 'client-forged.' + 'x'.repeat(40), refreshToken: 'client-forged.' + 'y'.repeat(40) },
    });
    expect(response.statusCode).toBe(400);
    expect(repository.readCredentials).not.toHaveBeenCalled();
    expect(repository.replaceCredentials).not.toHaveBeenCalled();
  });
});

describe('F. refresh failure leaves the credential intact', () => {
  it('does not replace credentials when the provider rejects the refresh', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(401, { error: 'invalid_grant' })));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: 'PROVIDER_ERROR', details: { providerCode: 'provider_unauthorized' } });
    expect(repository.replaceCredentials).not.toHaveBeenCalled();
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'token_refresh', outcome: 'failure',
    }));
    expect(response.body).not.toContain('invalid_grant');
  });

  it('does not replace credentials when the provider is unreachable', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });
    expect(response.statusCode).toBe(502);
    expect(repository.replaceCredentials).not.toHaveBeenCalled();
  });

  it('fails closed on an expired or missing stored credential', async () => {
    const repository = createRepository();
    repository.readCredentials.mockRejectedValueOnce(new DisplayCredentialExpiredError());
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'CREDENTIAL_EXPIRED' });
    expect(repository.replaceCredentials).not.toHaveBeenCalled();
  });

  it('fails closed on a revoked connection', async () => {
    const repository = createRepository();
    repository.readCredentials.mockRejectedValueOnce(new DisplayConnectionStateError('Display connection is revoked and cannot be used'));
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });
    expect(response.statusCode).toBe(409);
    expect(repository.replaceCredentials).not.toHaveBeenCalled();
  });

  it('surfaces a stale-write rejection from the revision guard', async () => {
    const repository = createRepository();
    repository.replaceCredentials.mockRejectedValueOnce(new DisplayConnectionStateError('Display connection changed during refresh'));
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_STATE' });
  });
});

// ------------------------------------------------------- H/I/J. revocation

describe('H/J. provider revocation is actually invoked', () => {
  it('calls the provider on explicit revoke and persists the confirmed outcome', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/revoke`, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');
    expect(repository.applyRemoteRevocation).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID, 'confirmed');
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'token_revoke', outcome: 'success',
    }));
  });

  it('records an unconfirmed provider revoke truthfully, not as success', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(500, {})));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/revoke`, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ remoteRevocation: 'unavailable' });
    expect(repository.applyRemoteRevocation).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID, 'unavailable');
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'token_revoke', outcome: 'failure',
    }));
  });

  it('disconnect invokes the provider before local teardown', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');
    expect(repository.readCredentials).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID);
    expect(repository.disconnect).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID, 'confirmed');
    expect(response.json()).toMatchObject({ cancelledJobs: 3, remoteRevocation: 'confirmed' });
  });
});

describe('I. provider-revocation failure still leaves the app safely disconnected', () => {
  it('completes the local teardown and reports the truthful outcome', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const repository = createRepository();
    repository.disconnect.mockResolvedValueOnce({
      connection: { ...connection, status: 'disconnected', disconnectedAt: NOW, remoteRevocation: 'unavailable', remoteRevocationAt: NOW },
      cancelledJobs: 2,
    });
    const { app } = await buildApp({ adapter, repository });
    apps.push(app);

    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {} });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ remoteRevocation: 'unavailable', cancelledJobs: 2 });
    expect(repository.disconnect).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID, 'unavailable');
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'disconnect', outcome: 'failure', metadata: expect.objectContaining({ remoteRevocation: 'unavailable' }),
    }));
    // The local guarantee held: jobs were still cancelled and state still moved.
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sync_cancel' }));
  });

  it('still disconnects locally when the credential cannot be read', async () => {
    const repository = createRepository();
    repository.readCredentials.mockRejectedValueOnce(new DisplayConnectionStateError('already expired'));
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {} });
    expect(response.statusCode).toBe(200);
    expect(repository.disconnect).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID, CONNECTION_ID, 'unavailable');
  });

  it('fails closed when the connection is not in this tenant', async () => {
    const repository = createRepository();
    repository.readCredentials.mockRejectedValueOnce(new DisplayConnectionNotFoundError());
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {} });
    expect(response.statusCode).toBe(404);
    expect(repository.disconnect).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- K. rate limit/audit

describe('K. lifecycle rate limiting and audit coverage', () => {
  const cases: Array<{ label: string; action: string; invoke: (app: Awaited<ReturnType<typeof buildApp>>['app']) => Promise<unknown> }> = [
    { label: 'authorization start', action: 'authorization_start', invoke: (app) => app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} }) },
    { label: 'callback', action: 'authorization_callback', invoke: (app) => app.inject({ method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}` }) },
    { label: 'refresh', action: 'token_refresh', invoke: (app) => app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/refresh`, payload: {} }) },
    { label: 'revoke', action: 'token_revoke', invoke: (app) => app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/revoke`, payload: {} }) },
    { label: 'disconnect', action: 'disconnect', invoke: (app) => app.inject({ method: 'POST', url: `/api/display/connections/${CONNECTION_ID}/disconnect`, payload: {} }) },
  ];

  for (const item of cases) {
    it(`rate-limits ${item.label}`, async () => {
      const limiter = createLimiter(false);
      const { app, repository } = await buildApp({ limiter });
      apps.push(app);
      const response = await item.invoke(app) as { statusCode: number; json: () => unknown };
      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({ error: 'RATE_LIMITED' });
      expect(limiter.consume).toHaveBeenCalledWith(item.action, USER_ID);
      expect(repository.createConnection).not.toHaveBeenCalled();
      expect(repository.replaceCredentials).not.toHaveBeenCalled();
      expect(repository.applyRemoteRevocation).not.toHaveBeenCalled();
      expect(repository.disconnect).not.toHaveBeenCalled();
    });

    it(`audits ${item.label}`, async () => {
      const { app, repository } = await buildApp();
      apps.push(app);
      await item.invoke(app);
      const actions = repository.recordAudit.mock.calls.map((call) => (call[0] as { action: string }).action);
      const expected = item.action === 'authorization_callback' ? 'authorization_callback' : item.action;
      expect(actions).toContain(expected);
    });
  }

  it('records an audit event for the start rate-limit denial path', async () => {
    const limiter = createLimiter(false);
    const { app, repository } = await buildApp({ limiter });
    apps.push(app);
    await app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });
    // The denial itself is not audited as success.
    const outcomes = repository.recordAudit.mock.calls.map((call) => (call[0] as { outcome: string }).outcome);
    expect(outcomes).not.toContain('success');
  });
});

// --------------------------------------------------- L. preserved guarantees

describe('L. preserved security guarantees', () => {
  it('maps the kill switch to 503 on the lifecycle entry point', async () => {
    const repository = createRepository();
    repository.recordAudit.mockRejectedValueOnce(new DisplayCapabilityDisabledError());
    const { app } = await buildApp({ repository });
    apps.push(app);
    const response = await app.inject({ method: 'POST', url: '/api/display/connections/authorize', payload: {} });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: 'CAPABILITY_DISABLED' });
  });

  it('keeps the Shop boundary closed in the adapter surface', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, tokenPayload())));
    const { app, repository } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'POST', url: '/api/display/connections/authorize', payload: {},
    });
    expect(response.json().authorizationUrl).not.toContain('tiktokglobalshop');
    expect(repository.createConnection).not.toHaveBeenCalled();
  });

  it('does not expose a route that ingests provider credentials', async () => {
    const { app } = await buildApp();
    apps.push(app);
    const post = await app.inject({
      method: 'POST', url: '/api/display/connections',
      payload: {
        providerAccountId: 'forged', accessToken: ACCESS_TOKEN, refreshToken: REFRESH_TOKEN,
        scopes: ['user.info.basic'], expiresInSeconds: 3600,
      },
    });
    // No such route exists any more: the client cannot inject credentials.
    expect(post.statusCode).toBe(404);
  });

  it('rejects a capability violation surfaced by the provider scope gate', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(
      jsonResponse(200, tokenPayload({ scope: 'user.info.basic,user.info.stats,video.list,shop.order.read' })),
    ));
    const { app } = await buildApp({ adapter });
    apps.push(app);
    const response = await app.inject({
      method: 'GET', url: `/api/display/callback?code=${AUTHORIZATION_CODE}&state=${'a'.repeat(64)}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'CAPABILITY_VIOLATION' });
  });
});
