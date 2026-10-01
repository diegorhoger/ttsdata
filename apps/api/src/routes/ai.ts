import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { AIRepository, AIKeyCipher } from '@ttsdata/db';
import { AIError, AI_DISCLOSURE, AI_DISCLOSURE_VERSION, type AIProvider } from '@ttsdata/shared';
import { pool } from '../lib/db';
import { requireAuth, requireRoles } from '../lib/auth';
import { AppError } from '../lib/errors';
import { AIGateway } from '../ai/gateway';
import { OpenRouterProvider } from '../ai/openrouter';

type AIRouteStore = Pick<AIRepository, 'listKeys' | 'putKey' | 'credential' | 'changeKey' | 'consent' | 'withdrawConsent' | 'configure' | 'configureTenant' | 'ledger'>;
export type AIRouteOptions = { repository?: AIRouteStore; provider?: AIProvider; gateway?: Pick<AIGateway, 'generate'>; authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>; allowInsecureForTests?: boolean };
const status = (code: string) => code === 'INVALID_REQUEST' ? 400 : code === 'RATE_LIMITED' || code === 'LIMIT_EXCEEDED' ? 429 : code === 'CANCELLED' ? 499 : code === 'TIMEOUT' ? 504 : 409;
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new AppError('AI request validation failed', 400, 'INVALID_REQUEST'); return result.data; }
const identity = (request: FastifyRequest) => ({ workspaceId: request.auth!.workspaceId, userId: request.auth!.userId });

export async function registerAIRoutes(app: FastifyInstance, options: AIRouteOptions = {}) {
  // Lazy initialization: missing AI secrets do not disrupt deterministic analytics or server startup.
  let repository = options.repository; let gateway = options.gateway; const provider = options.provider ?? new OpenRouterProvider();
  const store = () => {
    if (!repository) {
      try {
        const keyring = JSON.parse(process.env.AI_ENCRYPTION_KEYS ?? '{}'); const cipher = new AIKeyCipher(keyring, Number(process.env.AI_ENCRYPTION_VERSION));
        repository = new AIRepository(pool, cipher);
      } catch { throw new AppError('AI is not configured', 503, 'DISABLED'); }
    }
    return repository;
  };
  const auth = options.authenticate ?? requireAuth;
  const secure = async (request: FastifyRequest) => { if (request.protocol !== 'https' && !options.allowInsecureForTests) throw new AppError('AI credentials require HTTPS', 400, 'HTTPS_REQUIRED'); };
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AIError) return reply.status(status(error.code)).send({ error: error.code, message: error.message });
    if (error instanceof AppError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    // Never log an exception that may contain an upstream payload or request credentials.
    return reply.status(503).send({ error: 'PROVIDER_UNAVAILABLE', message: 'AI is unavailable.' });
  });
  app.get('/disclosure', { preHandler: auth }, async () => AI_DISCLOSURE);
  app.put('/consent', { preHandler: auth }, async (request) => {
    const body = parse(z.object({ version: z.literal(AI_DISCLOSURE_VERSION), accepted: z.literal(true), requireZdr: z.boolean().default(true) }).strict(), request.body);
    await store().consent(identity(request), body.requireZdr ?? true); return { accepted: true, version: body.version };
  });
  app.delete('/consent', { preHandler: auth }, async (request) => { await store().withdrawConsent(identity(request)); return { withdrawn: true }; });
  app.get('/keys', { preHandler: auth }, async (request) => ({ keys: await store().listKeys(identity(request)) }));
  app.put('/keys/byok', { preHandler: [auth, secure] }, async (request) => {
    const body = parse(z.object({ key: z.string().min(16).max(4096).regex(/^\S+$/) }).strict(), request.body);
    const state = await provider.validateKey(body.key, AbortSignal.timeout(10_000)); if (state.state !== 'valid') throw new AIError('OUT_OF_CREDITS');
    return { key: await store().putKey(identity(request), 'byok', provider.id, body.key, true) };
  });
  app.post('/keys/byok/validate', { preHandler: [auth, secure] }, async (request) => {
    const credential = await store().credential(identity(request), 'byok', provider.id);
    return await provider.validateKey(credential.key, AbortSignal.timeout(10_000));
  });
  for (const operation of ['disable', 'delete'] as const) app.post(`/keys/byok/${operation}`, { preHandler: auth }, async (request) => ({ changed: await store().changeKey(identity(request), 'byok', provider.id, operation) }));
  app.put('/controls', { preHandler: [auth, requireRoles('owner', 'admin')] }, async (request) => {
    const body = parse(z.object({ enabled: z.boolean() }).strict(), request.body); await store().configure(identity(request), body.enabled); return body;
  });
  app.put('/workspace-controls', { preHandler: [auth, requireRoles('owner', 'admin')] }, async (request) => {
    const body = parse(z.object({ enabled: z.boolean() }).strict(), request.body); await store().configureTenant(identity(request), body.enabled); return body;
  });
  app.get('/usage', { preHandler: auth }, async (request) => ({ ledger: await store().ledger(identity(request)) }));
  app.post('/generate', { preHandler: auth }, async (request, reply) => {
    const body = parse(z.object({ correlationId: z.string().uuid().optional(), contentId: z.string().uuid(), model: z.string().min(1).max(128),
      mode: z.enum(['byok', 'platform']), maxOutputTokens: z.number().int().min(32).max(2048).default(512) }).strict(), request.body);
    if (body.mode === 'platform' && !['creator', 'pro', 'agency'].includes(request.auth!.planCode)) throw new AIError('DISABLED');
    if (!gateway) gateway = new AIGateway(provider, store() as AIRepository);
    const controller = new AbortController(); const abort = () => controller.abort();
    request.raw.once('aborted', abort); const close = () => { if (!reply.raw.writableEnded) abort(); }; reply.raw.once('close', close);
    try { return await gateway.generate(identity(request), { ...body, maxOutputTokens: body.maxOutputTokens ?? 512, correlationId: body.correlationId ?? randomUUID(), signal: controller.signal }); }
    finally { request.raw.removeListener('aborted', abort); reply.raw.removeListener('close', close); }
  });
}
