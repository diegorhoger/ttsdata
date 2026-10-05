/**
 * Issue #20 — Display authorization lifecycle API.
 *
 * The production lifecycle is orchestrated here, not delegated to the client:
 *
 *   POST /connections/authorize      → durable hashed state + approved auth URL
 *   GET  /callback                   → atomic state consumption, server-side code
 *                                      exchange, encrypted connection creation
 *   POST /connections/:id/refresh    → server-side stored-credential refresh
 *   POST /connections/:id/revoke     → provider revocation, then local transition
 *   POST /connections/:id/disconnect → provider revocation, then local teardown
 *
 * An ordinary client can never inject a provider credential: no route accepts
 * an access or refresh token, and the provider account identity is derived from
 * the trusted token response rather than supplied by the caller.
 *
 * The tenant always comes from the authenticated context. The callback is the
 * one endpoint carrying no session, so it is authorized by the single-use state
 * record that the start call persisted — which is itself tenant-bound.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import {
  DisplayConnectionRepository,
  DisplayRateLimiter,
  DisplayCapabilityDisabledError,
  DisplayConnectionNotFoundError,
  DisplayConnectionStateError,
  DisplayCredentialExpiredError,
  CredentialCipher,
  loadCredentialCipher,
  CapabilityError,
  DisplayApiAdapter,
  DisplayApiError,
  DisplaySyncService,
  OAuthRepository,
  buildAuthorizeUrl,
  assertDisplayEndpointAllowed,
  assertAllApprovedScopesGranted,
  APPROVED_DISPLAY_SCOPES,
  loadDisplayConfig,
  type DisplayConfig,
  type DisplayConnectionRecord,
  type RemoteRevocationState,
} from '@ttsdata/db';
import { requireAuth, requireRoles } from '../lib/auth';
import { AppError } from '../lib/errors';

const connectionParams = z.object({ connectionId: z.string().uuid() }).strict();

/** Start takes no client-supplied identity or credential. */
const authorizeSchema = z.object({}).strict();

/** Refresh takes no client input: the credential comes from server storage. */
const refreshSchema = z.object({}).strict();

/**
 * The callback carries only provider callback material.
 *
 * TikTok's Web Login Kit documents three successful-callback parameters:
 * `code`, `scopes`, and `state`. `scopes` is the comma-separated set of scopes
 * the USER granted, which can be a strict subset of what was requested. It is
 * declared here (rather than left to `.strict()` rejection) because the live
 * probe observed TikTok sending it; a strict schema without it fails closed on
 * a legitimate successful callback.
 *
 * `.strict()` is retained: genuinely unknown parameters are still rejected.
 */
const callbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(4096).optional(),
  state: z.string().trim().min(1).max(512).optional(),
  // Bounded: a comma-separated scope list. 1024 chars is far above any real
  // scope set and keeps the parameter from being an unbounded input.
  scopes: z.string().trim().max(1024).optional(),
  error: z.string().trim().max(256).optional(),
  // Accepted because the provider sends it on denial, but deliberately never
  // read: it is untrusted text that can echo the authorization code.
  error_description: z.string().trim().max(1024).optional(),
}).strict();

const enqueueSchema = z.object({ kind: z.enum(['profile_sync', 'video_sync']) }).strict();

const evidenceSchema = z.object({
  operation: z.enum(['user_info', 'video_list']),
  succeeded: z.boolean(),
  statusCode: z.number().int().min(100).max(599).nullable().optional(),
  payload: z.record(z.unknown()).optional(),
  errorCode: z.string().trim().min(1).max(64).nullable().optional(),
}).strict();

/** Explicit allow-list: a credential cannot reach a response by accident. */
function connectionView(connection: DisplayConnectionRecord) {
  return {
    id: connection.id,
    provider: connection.provider,
    scopes: connection.scopes,
    status: connection.status,
    revision: connection.revision,
    remoteRevocation: connection.remoteRevocation,
    remoteRevocationAt: connection.remoteRevocationAt,
    authorizedAt: connection.authorizedAt,
    expiresAt: connection.expiresAt,
    refreshExpiresAt: connection.refreshExpiresAt,
    lastRefreshedAt: connection.lastRefreshedAt,
    lastSyncAt: connection.lastSyncAt,
    revokedAt: connection.revokedAt,
    disconnectedAt: connection.disconnectedAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('Request validation failed', 400, 'VALIDATION_ERROR', {
      fields: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

/** Maps repository/capability failures onto stable HTTP outcomes. */
function translate(error: unknown): never {
  if (error instanceof DisplayCapabilityDisabledError) {
    throw new AppError('Display capability is disabled', 503, 'CAPABILITY_DISABLED');
  }
  if (error instanceof DisplayConnectionNotFoundError) {
    throw new AppError('Display connection not found', 404, 'NOT_FOUND');
  }
  if (error instanceof DisplayCredentialExpiredError) {
    throw new AppError('Display refresh credential expired', 409, 'CREDENTIAL_EXPIRED');
  }
  if (error instanceof DisplayConnectionStateError) {
    throw new AppError(error.message, 409, 'INVALID_STATE');
  }
  if (error instanceof CapabilityError) {
    throw new AppError(error.message, 400, 'CAPABILITY_VIOLATION');
  }
  if (error instanceof DisplayApiError) {
    throw new AppError('Display provider rejected the request', 502, 'PROVIDER_ERROR', {
      providerCode: error.errorCode,
    });
  }
  throw error;
}

/**
 * Attempt provider revocation. Never throws: the caller needs a truthful
 * outcome, and a provider outage must not abort the local disconnect.
 */
async function attemptRemoteRevocation(
  adapter: DisplayApiAdapter,
  config: DisplayConfig,
  accessToken: string,
): Promise<Exclude<RemoteRevocationState, 'not_attempted'>> {
  try {
    const result = await adapter.revoke(accessToken, config);
    return result.confirmed ? 'confirmed' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export type DisplayRouteOptions = {
  repository?: DisplayConnectionRepository;
  oauthRepository?: OAuthRepository;
  rateLimiter?: DisplayRateLimiter;
  adapter?: DisplayApiAdapter;
  config?: DisplayConfig;
  authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export async function registerDisplayRoutes(app: FastifyInstance, options: DisplayRouteOptions = {}) {
  const authenticate = options.authenticate ?? requireAuth;
  const authorizeWrite = requireRoles('owner', 'admin');

  const config = options.config ?? loadDisplayConfig();
  const adapter = options.adapter ?? new DisplayApiAdapter();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const limiter = options.rateLimiter ?? new DisplayRateLimiter(
    pool, process.env.DISPLAY_RATE_LIMIT_SECRET ?? config.sessionSecret,
  );
  const repository = options.repository ?? DisplayConnectionRepository.fromUrl(
    process.env.DATABASE_URL ?? '', loadCredentialCipher() as CredentialCipher,
  );
  const oauthRepository = options.oauthRepository ?? new OAuthRepository(pool, {
    stateSecret: config.stateSecret,
    sessionSecret: config.sessionSecret,
    resultSecret: config.resultSecret,
  });

  const enforceRateLimit = async (action: Parameters<DisplayRateLimiter['consume']>[0], subject: string) => {
    const outcome = await limiter.consume(action, subject);
    if (!outcome.allowed) {
      throw new AppError('Too many requests', 429, 'RATE_LIMITED', { retryAfterSeconds: outcome.retryAfterSeconds });
    }
  };

  // ------------------------------------------------------------ authorization

  /**
   * Step 1. Persists a durable hashed state bound to the authenticated tenant,
   * rate-limits and audits the attempt, and returns the approved TikTok
   * authorization URL. The client secret never leaves the server; only the
   * public client key appears in the URL.
   */
  app.post('/connections/authorize', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    parse(authorizeSchema, request.body ?? {});
    await enforceRateLimit('authorization_start', auth.userId);
    try {
      const rawState = randomBytes(32).toString('hex');
      const sessionId = randomBytes(32).toString('hex');
      await oauthRepository.createState({
        rawState,
        sessionId,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        workspaceId: auth.workspaceId,
        userId: auth.userId,
      });
      const authUrl = buildAuthorizeUrl(config, rawState);
      assertDisplayEndpointAllowed(new URL(authUrl).origin + new URL(authUrl).pathname);
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId,
        action: 'authorization_start', outcome: 'success',
        metadata: { scopes: APPROVED_DISPLAY_SCOPES.slice() },
      });
      // The raw state is returned so the caller can correlate the redirect. It
      // is single-use, tenant-bound and short-lived; no secret is included.
      return reply.status(201).send({ authorizationUrl: authUrl, state: rawState });
    } catch (error) {
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId,
        action: 'authorization_start', outcome: 'failure', metadata: { reason: 'start_rejected' },
      }).catch(() => undefined);
      translate(error);
    }
  });

  /**
   * Step 2. Authorized by the single-use state record rather than a session:
   * the provider redirects the browser here. The state is consumed atomically
   * before any provider call, so a replay cannot reach the exchange.
   */
  app.get('/callback', async (request, reply) => {
    const query = parse(callbackQuerySchema, request.query);

    // A denial callback is still a callback: it must be state-correlated,
    // single-use, rate-limited and audited. A denial with no state cannot be
    // correlated, so it is refused outright.
    const isDenial = Boolean(query.error);
    const stateParam = query.state;
    if (!stateParam) {
      return reply.status(400).send({ error: isDenial ? 'INVALID_STATE' : 'INVALID_CALLBACK' });
    }
    const codeParam = query.code;
    if (!isDenial && !codeParam) {
      return reply.status(400).send({ error: 'INVALID_CALLBACK' });
    }

    // Consumption is atomic, replay-safe and tenant-bound, and happens for
    // denials too — so a denied authorization cannot leave a reusable state.
    // The provider error text is never consulted to authorize this.
    const consumed = await oauthRepository.consumeTenantBoundState(stateParam);
    if (!consumed.success) {
      return reply.status(400).send({ error: 'INVALID_STATE', reason: consumed.error });
    }
    const workspaceId = consumed.workspaceId;
    const userId = consumed.userId;
    if (!workspaceId || !userId) {
      return reply.status(400).send({ error: 'INVALID_STATE', reason: 'unbound_state' });
    }

    await enforceRateLimit('authorization_callback', userId);

    if (isDenial) {
      // Sanitized audit only: the raw provider error is neither persisted,
      // echoed, nor audited. No token exchange, no connection.
      await repository.recordAudit({
        workspaceId, userId,
        action: 'authorization_callback', outcome: 'failure',
        metadata: { reason: 'provider_denied' },
      }).catch(() => undefined);
      return reply.status(400).send({ error: 'PROVIDER_DENIED' });
    }

    try {
      // Defense in depth, part 1: if the provider told us on the callback which
      // scopes the user granted, require them to satisfy the Display contract
      // BEFORE spending a token exchange. A user may grant a subset of what was
      // requested, and that must fail closed here rather than persist a
      // connection that cannot serve the probe.
      const callbackScopes = query.scopes
        ? query.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : null;
      if (callbackScopes) {
        assertAllApprovedScopesGranted(callbackScopes);
      }

      const tokens = await adapter.exchangeAuthorizationCode(config, codeParam!);
      // Defense in depth, part 2: the token response is still authoritative for
      // what was actually granted. Callback scopes do NOT replace this check.
      const scopes = assertAllApprovedScopesGranted(tokens.scopes);
      if (!tokens.providerAccountHashInput) {
        throw new DisplayApiError('Provider response omitted the account identity', 200, 'malformed_token_response');
      }
      const connection = await repository.createConnection({
        workspaceId, userId,
        // Identity comes from the trusted provider response, never the client.
        providerAccountId: tokens.providerAccountHashInput,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        scopes,
        expiresInSeconds: tokens.expiresInSeconds,
        refreshExpiresInSeconds: tokens.refreshExpiresInSeconds,
      });
      await repository.recordAudit({
        workspaceId, userId, connectionId: connection.id,
        action: 'authorization_callback', outcome: 'success', metadata: { scopes: connection.scopes },
      });
      return reply.status(201).send({ connection: connectionView(connection) });
    } catch (error) {
      await repository.recordAudit({
        workspaceId, userId,
        action: 'authorization_callback', outcome: 'failure',
        metadata: { reason: 'exchange_or_persist_failed' },
      }).catch(() => undefined);
      translate(error);
    }
  });

  // ------------------------------------------------------------------ refresh

  /**
   * Server-side refresh. The client submits nothing: the refresh credential is
   * loaded from encrypted storage for the tenant-scoped connection. A provider
   * failure leaves the last valid durable credential untouched.
   */
  app.post('/connections/:connectionId/refresh', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('token_refresh', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    // A client that submits a replacement credential is rejected, not ignored.
    parse(refreshSchema, request.body ?? {});
    try {
      const stored = await repository.readCredentials(auth.workspaceId, auth.userId, connectionId);
      let refreshed;
      try {
        refreshed = await adapter.refreshAccessToken(config, stored.refreshToken);
      } catch (error) {
        // Truthful audit; the stored credential is deliberately left intact.
        const reason = error instanceof DisplayApiError ? error.errorCode : 'provider_unreachable';
        await repository.recordAudit({
          workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
          action: 'token_refresh', outcome: 'failure', metadata: { reason },
        }).catch(() => undefined);
        if (error instanceof DisplayApiError) translate(error);
        throw new AppError('Display provider is unreachable', 502, 'PROVIDER_ERROR', { providerCode: reason });
      }
      const scopes = assertAllApprovedScopesGranted(refreshed.scopes);
      const connection = await repository.replaceCredentials({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        scopes,
        expiresInSeconds: refreshed.expiresInSeconds,
        refreshExpiresInSeconds: refreshed.refreshExpiresInSeconds,
      });
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'token_refresh', outcome: 'success', metadata: { revision: connection.revision },
      });
      return reply.send({ connection: connectionView(connection) });
    } catch (error) {
      translate(error);
    }
  });

  // --------------------------------------------------------------- revocation

  /**
   * Explicit provider revocation. The provider is called first; only its
   * truthful outcome is persisted. A local-only status change is never
   * reported as a confirmed revocation.
   */
  app.post('/connections/:connectionId/revoke', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('token_revoke', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const stored = await repository.readCredentials(auth.workspaceId, auth.userId, connectionId);
      const outcome = await attemptRemoteRevocation(adapter, config, stored.accessToken);
      const connection = await repository.applyRemoteRevocation(
        auth.workspaceId, auth.userId, connectionId, outcome,
      );
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'token_revoke',
        outcome: outcome === 'confirmed' ? 'success' : 'failure',
        metadata: { remoteRevocation: outcome },
      });
      return reply.send({ connection: connectionView(connection), remoteRevocation: outcome });
    } catch (error) {
      translate(error);
    }
  });

  /**
   * Disconnect. Order matters: obtain the credential, attempt provider
   * revocation, then perform the local terminal teardown. The local safety
   * guarantee holds even when the provider is unreachable — the connection is
   * always disconnected locally, and the audit distinguishes the two cases.
   */
  app.post('/connections/:connectionId/disconnect', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('disconnect', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    try {
      let outcome: Exclude<RemoteRevocationState, 'not_attempted'> = 'unavailable';
      try {
        const stored = await repository.readCredentials(auth.workspaceId, auth.userId, connectionId);
        outcome = await attemptRemoteRevocation(adapter, config, stored.accessToken);
      } catch (error) {
        // An unreadable credential is not a reason to skip the local teardown.
        if (error instanceof DisplayConnectionNotFoundError) translate(error);
        outcome = 'unavailable';
      }
      const result = await repository.disconnect(auth.workspaceId, auth.userId, connectionId, outcome);
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'disconnect',
        outcome: outcome === 'confirmed' ? 'success' : 'failure',
        metadata: { remoteRevocation: outcome, cancelledJobs: result.cancelledJobs },
      });
      if (result.cancelledJobs > 0) {
        await repository.recordAudit({
          workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
          action: 'sync_cancel', outcome: 'success', metadata: { cancelledJobs: result.cancelledJobs },
        });
      }
      return reply.send({
        connection: connectionView(result.connection),
        cancelledJobs: result.cancelledJobs,
        remoteRevocation: outcome,
      });
    } catch (error) {
      translate(error);
    }
  });

  // -------------------------------------------------------------- connections

  app.get('/connections', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    try {
      const connections = await repository.listConnections(auth.workspaceId, auth.userId);
      return reply.send({ connections: connections.map(connectionView) });
    } catch (error) {
      translate(error);
    }
  });

  app.get('/connections/:connectionId', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const connection = await repository.getConnection(auth.workspaceId, auth.userId, connectionId);
      if (!connection) throw new AppError('Display connection not found', 404, 'NOT_FOUND');
      return reply.send({ connection: connectionView(connection) });
    } catch (error) {
      translate(error);
    }
  });

  app.post('/connections/:connectionId/jobs', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    const body = parse(enqueueSchema, request.body);
    try {
      const job = await repository.enqueueSyncJob({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId, kind: body.kind,
      });
      return reply.status(201).send({ job });
    } catch (error) {
      translate(error);
    }
  });

  app.get('/connections/:connectionId/jobs', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const connection = await repository.getConnection(auth.workspaceId, auth.userId, connectionId);
      if (!connection) throw new AppError('Display connection not found', 404, 'NOT_FOUND');
      const queued = await repository.countJobs(auth.workspaceId, connectionId, 'queued');
      const cancelled = await repository.countJobs(auth.workspaceId, connectionId, 'cancelled');
      return reply.send({ queued, cancelled });
    } catch (error) {
      translate(error);
    }
  });

  app.get('/audit', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const events = await repository.listAudit(auth.workspaceId, auth.userId);
    return reply.send({ events });
  });

  app.post('/evidence', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    const body = parse(evidenceSchema, request.body);
    try {
      await repository.recordProbeEvidence({
        workspaceId: auth.workspaceId, userId: auth.userId, ...body,
      });
      return reply.status(201).send({ ok: true });
    } catch (error) {
      translate(error);
    }
  });

  app.get('/evidence', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const evidence = await repository.listProbeEvidence(auth.workspaceId, auth.userId);
    return reply.send({ evidence });
  });

  // -------------------------------------------------------------- sync (Issue #21)

  const syncService = new DisplaySyncService({ repository, adapter, config });

  /** Trigger a profile sync. */
  app.post('/connections/:connectionId/sync/profile', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const result = await syncService.syncProfile(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ result });
    } catch (error) {
      translate(error);
    }
  });

  /** Trigger a video sync with cursor pagination. */
  app.post('/connections/:connectionId/sync/videos', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const result = await syncService.syncVideos(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ result });
    } catch (error) {
      translate(error);
    }
  });

  /** List sync runs for a connection. */
  app.get('/connections/:connectionId/sync/runs', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const runs = await syncService.listSyncRuns(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ runs });
    } catch (error) {
      translate(error);
    }
  });

  /** Get the current profile for a connection. */
  app.get('/connections/:connectionId/profile', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const profile = await syncService.getProfile(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ profile });
    } catch (error) {
      translate(error);
    }
  });

  /** List videos for a connection. */
  app.get('/connections/:connectionId/videos', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const videos = await syncService.listVideos(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ videos });
    } catch (error) {
      translate(error);
    }
  });

  /** List metric provenance for a connection. */
  app.get('/connections/:connectionId/metrics', { preHandler: authenticate }, async (request, reply) => {
    const auth = request.auth!;
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const metrics = await syncService.listMetrics(auth.workspaceId, auth.userId, connectionId);
      return reply.send({ metrics });
    } catch (error) {
      translate(error);
    }
  });
}
