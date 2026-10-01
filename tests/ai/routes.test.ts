import Fastify from '../../apps/api/node_modules/fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAIRoutes, type AIRouteOptions } from '../../apps/api/src/routes/ai';
import { errorHandler, AppError } from '../../apps/api/src/lib/errors';
import { AIError, FakeAIProvider, AI_DISCLOSURE_VERSION } from '../../packages/shared/src/ai';
const tenant = '11111111-1111-4111-8111-111111111111'; const user = '22222222-2222-4222-8222-222222222222';
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
function repository() { return { listKeys: vi.fn().mockResolvedValue([]), putKey: vi.fn().mockResolvedValue({ fingerprint: 'sha256:masked…' }), credential: vi.fn().mockResolvedValue({ key: 'private-credential', id: 'key', revision: 1 }), changeKey: vi.fn().mockResolvedValue(true), consent: vi.fn(), configure: vi.fn(), configureTenant: vi.fn(), ledger: vi.fn().mockResolvedValue([]) }; }
async function app(options: AIRouteOptions = {}, authenticated = true) {
  const server = Fastify({ logger: false }); server.setErrorHandler(errorHandler); apps.push(server);
  server.get('/non-ai', async () => { throw new AppError('deterministic error', 418, 'NON_AI'); });
  await server.register(registerAIRoutes, { prefix: '/api/ai', ...options, ...(authenticated ? { authenticate: async (request: any) => { request.auth = { workspaceId: tenant, userId: user, role: 'owner', planCode: 'pro', email: 'unused@example.test' }; } } : {}) });
  return server;
}
describe('AI API security boundary', () => {
  it('requires an authenticated session', async () => { const server = await app({}, false); expect((await server.inject('/api/ai/keys')).statusCode).toBe(401); });
  it('discloses fields/providers/retention/cost and accepts only exact consent version', async () => {
    const store = repository(); const server = await app({ repository: store }); const disclosure = (await server.inject('/api/ai/disclosure')).json();
    expect(disclosure.processors).toContain('OpenRouter'); expect(disclosure.fields).not.toContain('email');
    expect((await server.inject({ method: 'PUT', url: '/api/ai/consent', payload: { accepted: true, version: 'old' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PUT', url: '/api/ai/consent', payload: { accepted: true, version: AI_DISCLOSURE_VERSION } })).statusCode).toBe(200);
    expect(store.consent).toHaveBeenCalledWith({ workspaceId: tenant, userId: user }, true);
  });
  it('rejects key entry over HTTP before provider validation', async () => {
    const provider = new FakeAIProvider(); const validate = vi.spyOn(provider, 'validateKey'); const server = await app({ repository: repository(), provider });
    expect((await server.inject({ method: 'PUT', url: '/api/ai/keys/byok', payload: { key: 'private-credential' } })).statusCode).toBe(400); expect(validate).not.toHaveBeenCalled();
  });
  it('validates/rotates key using session identity and returns only masked metadata', async () => {
    const store = repository(); const server = await app({ repository: store, provider: new FakeAIProvider(), allowInsecureForTests: true });
    const response = await server.inject({ method: 'PUT', url: '/api/ai/keys/byok', payload: { key: 'private-credential' } });
    expect(response.statusCode).toBe(200); expect(response.body).not.toContain('private-credential');
    expect(store.putKey).toHaveBeenCalledWith({ workspaceId: tenant, userId: user }, 'byok', 'private-credential', true);
    expect((await server.inject({ method: 'PUT', url: '/api/ai/keys/byok', payload: { key: 'private-credential', workspaceId: 'other' } })).statusCode).toBe(400);
  });
  it('user BYOK routes cannot mutate platform keys', async () => {
    const store = repository(); const server = await app({ repository: store });
    await server.inject({ method: 'POST', url: '/api/ai/keys/byok/delete' }); expect(store.changeKey).toHaveBeenCalledWith({ workspaceId: tenant, userId: user }, 'byok', 'delete');
    expect((await server.inject({ method: 'POST', url: '/api/ai/keys/platform/delete' })).statusCode).toBe(404);
  });
  it('generation rejects extra input/tenant/fallback fields and returns stable sanitized errors', async () => {
    const gateway = { generate: vi.fn().mockRejectedValue(new AIError('OUT_OF_CREDITS')) }; const server = await app({ repository: repository(), gateway });
    const payload = { contentId: tenant, model: 'fake/summary', mode: 'byok' };
    expect((await server.inject({ method: 'POST', url: '/api/ai/generate', payload: { ...payload, prompt: 'secret', fallback: 'platform' } })).statusCode).toBe(400);
    const result = await server.inject({ method: 'POST', url: '/api/ai/generate', payload }); expect(result.json().error).toBe('OUT_OF_CREDITS'); expect(result.body).not.toContain('private-credential');
    expect(gateway.generate.mock.calls[0][0]).toEqual({ workspaceId: tenant, userId: user });
  });
  it('plugin-local error handler leaves deterministic route behavior unchanged', async () => {
    const server = await app(); const response = await server.inject('/non-ai'); expect(response.statusCode).toBe(418); expect(response.json().error).toBe('NON_AI');
  });
});
