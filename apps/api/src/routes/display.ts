/**
 * Issue #20 — Display authorization lifecycle API.
 *
 * Every handler derives the tenant from the authenticated context; a
 * client-supplied workspace or user identifier is rejected by strict schemas.
 * Credentials are never serialized: connection views are built from an explicit
 * allow-list of non-secret fields.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
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
  type DisplayConnectionRecord,
} from '@ttsdata/db';
import { requireAuth, requireRoles } from '../lib/auth';
import { AppError } from '../lib/errors';

const connectionParams = z.object({ connectionId: z.string().uuid() }).strict();

const createConnectionSchema = z.object({
  providerAccountId: z.string().trim().min(1).max(512),
  accessToken: z.string().min(1).max(4096),
  refreshToken: z.string().min(1).max(4096),
  scopes: z.array(z.string().trim().min(1).max(64)).min(1).max(16),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 365),
  refreshExpiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 3650).nullable().optional(),
}).strict();

const refreshSchema = z.object({
  accessToken: z.string().min(1).max(4096),
  refreshToken: z.string().min(1).max(4096),
  scopes: z.array(z.string().trim().min(1).max(64)).min(1).max(16),
  expiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 365),
  refreshExpiresInSeconds: z.number().int().positive().max(60 * 60 * 24 * 3650).nullable().optional(),
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
  throw error;
}

export type DisplayRouteOptions = {
  repository?: DisplayConnectionRepository;
  rateLimiter?: DisplayRateLimiter;
  authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export async function registerDisplayRoutes(app: FastifyInstance, options: DisplayRouteOptions = {}) {
  const authenticate = options.authenticate ?? requireAuth;
  const authorizeWrite = requireRoles('owner', 'admin');
  const limiter = options.rateLimiter ?? new DisplayRateLimiter(
    new Pool({ connectionString: process.env.DATABASE_URL }),
    process.env.DISPLAY_RATE_LIMIT_SECRET ?? process.env.OAUTH_SESSION_SECRET ?? '',
  );
  const repository = options.repository ?? DisplayConnectionRepository.fromUrl(
    process.env.DATABASE_URL ?? '', loadCredentialCipher() as CredentialCipher,
  );

  const enforceRateLimit = async (action: Parameters<DisplayRateLimiter['consume']>[0], subject: string) => {
    const outcome = await limiter.consume(action, subject);
    if (!outcome.allowed) {
      throw new AppError('Too many requests', 429, 'RATE_LIMITED', { retryAfterSeconds: outcome.retryAfterSeconds });
    }
  };

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

  app.post('/connections', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('authorization_callback', auth.userId);
    const body = parse(createConnectionSchema, request.body);
    try {
      const connection = await repository.createConnection({
        workspaceId: auth.workspaceId, userId: auth.userId, ...body,
      });
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId: connection.id,
        action: 'authorization_callback', outcome: 'success', metadata: { scopes: connection.scopes },
      });
      return reply.status(201).send({ connection: connectionView(connection) });
    } catch (error) {
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId,
        action: 'authorization_callback', outcome: 'failure', metadata: { reason: 'rejected' },
      }).catch(() => undefined);
      translate(error);
    }
  });

  app.post('/connections/:connectionId/refresh', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('token_refresh', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    const body = parse(refreshSchema, request.body);
    try {
      const connection = await repository.replaceCredentials({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId, ...body,
      });
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'token_refresh', outcome: 'success', metadata: { revision: connection.revision },
      });
      return reply.send({ connection: connectionView(connection) });
    } catch (error) {
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'token_refresh', outcome: 'failure', metadata: { reason: 'refresh_failed' },
      }).catch(() => undefined);
      translate(error);
    }
  });

  app.post('/connections/:connectionId/revoke', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('token_revoke', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const connection = await repository.markRevoked(auth.workspaceId, auth.userId, connectionId);
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'token_revoke', outcome: 'success', metadata: { status: connection.status },
      });
      return reply.send({ connection: connectionView(connection) });
    } catch (error) {
      translate(error);
    }
  });

  app.post('/connections/:connectionId/disconnect', { preHandler: [authenticate, authorizeWrite] }, async (request, reply) => {
    const auth = request.auth!;
    await enforceRateLimit('disconnect', auth.userId);
    const { connectionId } = parse(connectionParams, request.params);
    try {
      const result = await repository.disconnect(auth.workspaceId, auth.userId, connectionId);
      await repository.recordAudit({
        workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
        action: 'disconnect', outcome: 'success', metadata: { cancelledJobs: result.cancelledJobs },
      });
      if (result.cancelledJobs > 0) {
        await repository.recordAudit({
          workspaceId: auth.workspaceId, userId: auth.userId, connectionId,
          action: 'sync_cancel', outcome: 'success', metadata: { cancelledJobs: result.cancelledJobs },
        });
      }
      return reply.send({ connection: connectionView(result.connection), cancelledJobs: result.cancelledJobs });
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
}
