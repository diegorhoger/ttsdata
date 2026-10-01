import { describe, expect, it, vi } from 'vitest';
import { AIGateway, type AIGatewayStore } from '../../apps/api/src/ai/gateway';
import { AIError, AI_DISCLOSURE_VERSION, FakeAIProvider } from '../../packages/shared/src/ai';
const identity = { workspaceId: 'tenant-a', userId: 'user-a' };
const input = { correlationId: 'request', contentId: 'content', model: 'fake/summary', mode: 'byok' as const, maxOutputTokens: 64 };
function store() { return { assertEnabled: vi.fn().mockResolvedValue(undefined), getConsent: vi.fn().mockResolvedValue({ version: AI_DISCLOSURE_VERSION, requireZdr: true }),
  minimumInput: vi.fn().mockResolvedValue({ views: 10, clicks: null, orders: 2, conversion: null }), credential: vi.fn().mockResolvedValue({ id: 'key', revision: 1, key: 'private-credential' }),
  reserve: vi.fn().mockResolvedValue(undefined), authorizeDispatch: vi.fn().mockResolvedValue({ leaseId: 'lease', key: 'private-credential', requireZdr: true }), finalize: vi.fn().mockResolvedValue(undefined) } satisfies AIGatewayStore; }

describe('provider-neutral gateway', () => {
  it.each(['byok', 'platform'] as const)('runs product services with the fake provider in %s mode', async (mode) => {
    const provider = new FakeAIProvider(); const repository = store(); const result = await new AIGateway(provider, repository, () => true).generate(identity, { ...input, mode });
    expect(result.output).toEqual({ summary: 'Recorded metrics reviewed.', recommendations: [] });
    expect(repository.credential).toHaveBeenCalledWith(identity, mode, provider.id);
    expect(repository.reserve.mock.calls[0][1]).toMatchObject({ mode, requests: 3 });
    expect(repository.finalize.mock.calls[0][1]).toMatchObject({ mode, attempts: 1, unknown: false });
    expect(provider.requests[0].input).toEqual({ views: 10, clicks: null, orders: 2, conversion: null });
    expect(JSON.stringify(provider.requests[0])).not.toContain('private-credential');
    expect(provider.requests[0].requireZdr).toBe(true);
  });
  it('global kill switch results in zero network/discovery/store calls', async () => {
    const provider = new FakeAIProvider(); const models = vi.spyOn(provider, 'models'); const generate = vi.spyOn(provider, 'generate'); const repository = store();
    await expect(new AIGateway(provider, repository, () => false).generate(identity, input)).rejects.toMatchObject({ code: 'DISABLED' });
    expect(models).not.toHaveBeenCalled(); expect(generate).not.toHaveBeenCalled(); expect(repository.assertEnabled).not.toHaveBeenCalled();
  });
  it('tenant kill switch and missing/stale consent stop before model discovery', async () => {
    const provider = new FakeAIProvider(); const models = vi.spyOn(provider, 'models'); const repository = store();
    repository.assertEnabled.mockRejectedValueOnce(new AIError('DISABLED'));
    const gateway = new AIGateway(provider, repository, () => true);
    await expect(gateway.generate(identity, input)).rejects.toMatchObject({ code: 'DISABLED' });
    repository.getConsent.mockResolvedValueOnce({ version: 'old', requireZdr: false });
    await expect(gateway.generate(identity, input)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' }); expect(models).not.toHaveBeenCalled();
  });
  it('never falls from BYOK key failures to platform credentials', async () => {
    const repository = store(); repository.credential.mockRejectedValue(new AIError('KEY_DISABLED'));
    await expect(new AIGateway(new FakeAIProvider(), repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'KEY_DISABLED' });
    expect(repository.credential.mock.calls.every((call) => call[1] === 'byok')).toBe(true); expect(repository.reserve).not.toHaveBeenCalled();
  });
  it('rejects invalid structured output while retaining actual usage for ledger reconciliation', async () => {
    const repository = store(); const provider = new FakeAIProvider({ summary: 'x', recommendations: [], reasoning: 'do not store' });
    await expect(new AIGateway(provider, repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'INVALID_OUTPUT' });
    expect(repository.finalize.mock.calls[0][1]).toMatchObject({ errorCode: 'INVALID_OUTPUT', attempts: 1, unknown: false, result: { usage: { costUsd: '0' } } });
  });
  it('retries only bounded explicit rejections and uses the same key/model', async () => {
    const repository = store(); const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate').mockRejectedValueOnce(new AIError('RATE_LIMITED', true, 0)).mockRejectedValueOnce(new AIError('RATE_LIMITED', true, 0));
    await new AIGateway(provider, repository, () => true).generate(identity, input);
    expect(generate).toHaveBeenCalledTimes(3); expect(generate.mock.calls.every((call) => call[0].model === input.model)).toBe(true);
    expect(repository.finalize.mock.calls[0][1]).toMatchObject({ attempts: 3 });
  });
  it('402 does not retry or implicitly spend another account', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate').mockRejectedValue(new AIError('OUT_OF_CREDITS')); const repository = store();
    await expect(new AIGateway(provider, repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'OUT_OF_CREDITS' });
    expect(generate).toHaveBeenCalledOnce(); expect(repository.finalize.mock.calls[0][1]).toMatchObject({ unknown: false });
  });
  it('cancelled requests never dispatch', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate'); const controller = new AbortController(); controller.abort();
    await expect(new AIGateway(provider, store(), () => true).generate(identity, { ...input, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' }); expect(generate).not.toHaveBeenCalled();
  });
  it('timeout is stable and keeps unknown provider spend conservative', async () => {
    const provider = new FakeAIProvider(); vi.spyOn(provider, 'generate').mockImplementation((request) => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new AIError('CANCELLED')))));
    const repository = store(); await expect(new AIGateway(provider, repository, () => true, 10).generate(identity, input)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(repository.finalize.mock.calls[0][1]).toMatchObject({ errorCode: 'TIMEOUT', unknown: true });
  });
  it('opens a tenant/key-partitioned circuit after three provider failures', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate').mockRejectedValue(new AIError('PROVIDER_UNAVAILABLE')); const gateway = new AIGateway(provider, store(), () => true);
    for (let i = 0; i < 3; i++) await expect(gateway.generate(identity, input)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    await expect(gateway.generate(identity, input)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' }); expect(generate).toHaveBeenCalledTimes(3);
  });
  it('budget refusals occur before paid inference', async () => {
    const repository = store(); repository.reserve.mockRejectedValue(new AIError('LIMIT_EXCEEDED')); const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate');
    await expect(new AIGateway(provider, repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' }); expect(generate).not.toHaveBeenCalled(); expect(repository.finalize).not.toHaveBeenCalled();
  });
  it('revocation between advisory preparation and atomic dispatch authorization blocks all inference', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate'); const repository = store();
    repository.reserve.mockImplementationOnce(async () => { repository.authorizeDispatch.mockRejectedValue(new AIError('KEY_DISABLED')); });
    await expect(new AIGateway(provider, repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'KEY_DISABLED' });
    expect(generate).not.toHaveBeenCalled(); expect(repository.finalize.mock.calls[0][1]).toMatchObject({ attempts: 0, unknown: false });
  });
  it('an attempt authorized before revocation may complete; every retry requires a new authorization', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate'); const repository = store();
    repository.authorizeDispatch.mockImplementationOnce(async () => { repository.authorizeDispatch.mockRejectedValue(new AIError('KEY_DISABLED')); return { leaseId: 'first', key: 'authorized-key', requireZdr: true }; });
    await new AIGateway(provider, repository, () => true).generate(identity, input);
    expect(generate).toHaveBeenCalledOnce(); expect(repository.authorizeDispatch).toHaveBeenCalledOnce();
    const retryStore = store(); retryStore.authorizeDispatch.mockResolvedValueOnce({ leaseId: 'first', key: 'authorized-key', requireZdr: true }).mockRejectedValue(new AIError('DISABLED'));
    generate.mockRejectedValueOnce(new AIError('RATE_LIMITED', true, 0));
    await expect(new AIGateway(provider, retryStore, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'DISABLED' });
    expect(retryStore.authorizeDispatch).toHaveBeenCalledTimes(2); expect(generate).toHaveBeenCalledTimes(2);
  });
  it('consent withdrawal before authorization prevents dispatch even after initial consent passed', async () => {
    const provider = new FakeAIProvider(); const generate = vi.spyOn(provider, 'generate'); const repository = store();
    repository.authorizeDispatch.mockRejectedValue(new AIError('CONSENT_REQUIRED'));
    await expect(new AIGateway(provider, repository, () => true).generate(identity, input)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(generate).not.toHaveBeenCalled();
  });
});
