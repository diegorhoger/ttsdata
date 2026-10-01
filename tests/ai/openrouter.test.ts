import { describe, expect, it } from 'vitest';
import { AIError, type AIRequest } from '../../packages/shared/src/ai';
import { OpenRouterProvider } from '../../apps/api/src/ai/openrouter';

const controller = () => new AbortController().signal;
const model = (overrides: Record<string, unknown> = {}) => ({
  id: 'vendor/good', supported_parameters: ['structured_outputs', 'response_format'], context_length: 8192,
  top_provider: { max_completion_tokens: 2048 }, pricing: { prompt: '0.000001', completion: '0.000002', request: '0' }, ...overrides,
});
const modelsResponse = (data: unknown[]) => ({ data });
const req = (overrides: Partial<AIRequest> = {}): AIRequest => ({
  correlationId: 'corr-1', model: 'vendor/good', promptVersion: 'prompt.v1', schemaVersion: 'summary.v1',
  schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'], additionalProperties: false },
  instruction: 'Summarize only these aggregate metrics.', input: { views: 12 }, maxOutputTokens: 200, requireZdr: true,
  signal: controller(), ...overrides,
});
const response = (body: string | object, status = 200, headers?: Record<string, string>) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body), { status, headers },
);
const aiError = async (promise: Promise<unknown>, code: string) => {
  try { await promise; throw new Error('expected AIError'); }
  catch (error) { expect(error).toBeInstanceOf(AIError); expect(error).toMatchObject({ code }); }
};

describe('OpenRouter provider boundary', () => {
  it('filters models to entries with structured outputs and valid capability/pricing metadata, then caches them', async () => {
    let calls = 0;
    let now = 1_000;
    const provider = new OpenRouterProvider(async () => {
      calls += 1;
      return response(modelsResponse([
        model(),
        model({ id: 'vendor/no-structured', supported_parameters: ['response_format'] }),
        model({ id: 'vendor/no-response-format', supported_parameters: ['structured_outputs'] }),
        model({ id: 'vendor/bad-price', pricing: { prompt: 'not-a-decimal', completion: '0.1' } }),
      ]));
    }, () => now);
    const first = await provider.models(controller());
    const second = await provider.models(controller());
    expect(first).toEqual([{ id: 'vendor/good', structuredOutput: true, contextTokens: 8192, maxOutputTokens: 2048,
      inputUsdPerToken: '0.000001', outputUsdPerToken: '0.000002', requestUsd: '0' }]);
    expect(second).toBe(first);
    expect(calls).toBe(1);
    now += 300_001;
    await provider.models(controller());
    expect(calls).toBe(2);
  });

  it('sends strict structured output with fallback disabled, ZDR requested, and reasoning excluded', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const provider = new OpenRouterProvider(async (input, init) => {
      const url = String(input); seen.push({ url, init });
      if (url.endsWith('/models')) return response(modelsResponse([model()]));
      return response({ id: 'provider-id', model: 'vendor/good-revision', provider: 'vendor', choices: [{
        finish_reason: 'stop', message: { content: JSON.stringify({ summary: 'done' }), reasoning: 'must not escape' },
      }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, cost: 0.000018 } });
    }, () => 10_000);
    const result = await provider.generate(req(), 'private-key');
    const init = seen[1].init!;
    const body = JSON.parse(String(init.body));
    expect(seen.map((item) => item.url)).toEqual([
      'https://openrouter.ai/api/v1/models', 'https://openrouter.ai/api/v1/chat/completions',
    ]);
    expect(init.headers).toMatchObject({ authorization: 'Bearer private-key' });
    expect(body.response_format.json_schema).toMatchObject({ name: 'summary_v1', strict: true });
    expect(body.provider).toMatchObject({ require_parameters: true, allow_fallbacks: false, data_collection: 'deny', zdr: true });
    expect(body.reasoning).toEqual({ exclude: true });
    expect(result).toMatchObject({ output: { summary: 'done' }, resolvedProvider: 'vendor', finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 4, totalTokens: 14, costUsd: '0.000018', costSource: 'provider' } });
    expect(JSON.stringify(result)).not.toContain('must not escape');
  });

  it.each([
    [401, 'KEY_INVALID'], [402, 'OUT_OF_CREDITS'], [429, 'RATE_LIMITED'], [503, 'PROVIDER_UNAVAILABLE'],
  ])('maps HTTP %i to a sanitized %s error', async (status, code) => {
    const provider = new OpenRouterProvider(async () => response({ error: { message: 'secret provider diagnostics' } }, status, { 'retry-after': '9' }));
    try {
      await provider.validateKey('sensitive-key', controller());
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AIError);
      expect(error).toMatchObject({ code });
      expect((error as Error).message).not.toContain('secret provider diagnostics');
      expect((error as Error).message).not.toContain('sensitive-key');
      if (status === 429) expect(error).toMatchObject({ retryable: true, retryAfterMs: 2000 });
      if (status === 503) expect(error).toMatchObject({ retryable: true });
    }
  });

  it('rejects oversized or malformed provider JSON as a generic unavailable error', async () => {
    const oversized = new OpenRouterProvider(async () => response(' '.repeat(1_000_001)));
    await aiError(oversized.validateKey('key', controller()), 'PROVIDER_UNAVAILABLE');
    const malformed = new OpenRouterProvider(async () => response('{not json'));
    await aiError(malformed.validateKey('key', controller()), 'PROVIDER_UNAVAILABLE');
  });

  it('rejects invalid model output without leaking provider content', async () => {
    const provider = new OpenRouterProvider(async (input) => String(input).endsWith('/models')
      ? response(modelsResponse([model()]))
      : response({ id: 'id', model: 'vendor/good', choices: [{ finish_reason: 'stop', message: { content: 'not-json', reasoning: 'private thought' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    try { await provider.generate(req(), 'key'); throw new Error('expected rejection'); }
    catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_OUTPUT' });
      expect((error as Error).message).not.toContain('not-json');
      expect((error as Error).message).not.toContain('private thought');
    }
  });

  it('preserves valid token usage but reports absent or invalid provider cost as unavailable', async () => {
    const provider = new OpenRouterProvider(async (input) => String(input).endsWith('/models')
      ? response(modelsResponse([model()]))
      : response({ id: 'id', model: 'vendor/good', choices: [{ finish_reason: 'stop', message: { content: '{"summary":"ok"}' } }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5, cost: 'unknown' } }));
    const result = await provider.generate(req(), 'key');
    expect(result.usage).toEqual({ inputTokens: 2, outputTokens: 3, totalTokens: 5, costUsd: null, costSource: 'unavailable' });
  });
});
