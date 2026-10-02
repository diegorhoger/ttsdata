import { AIError, type AIProvider, type AIRequest, type AIResult, type ModelCapability, type AIAbortSignal } from '@ttsdata/shared';

const decimal = (value: unknown): value is string => typeof value === 'string' && /^\d+(?:\.\d{1,12})?$/.test(value) && Number.isFinite(Number(value));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
type ObjectValue = Record<string, any>;
/** Wire format is contained here. Never propagate HTTP body, headers, reasoning, key metadata or provider error messages. */
export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter';
  private cached: { at: number; models: ModelCapability[] } | null = null;
  constructor(private readonly transport: typeof fetch = fetch, private readonly now = Date.now) {}
  private async json(path: string, signal: AIAbortSignal, key?: string, body?: object): Promise<ObjectValue> {
    let response: Response;
    try { response = await this.transport(`https://openrouter.ai/api/v1${path}`, {
      method: body ? 'POST' : 'GET', signal: signal as AbortSignal, redirect: 'error',
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }); } catch { if (signal.aborted) throw new AIError('CANCELLED'); throw new AIError('PROVIDER_UNAVAILABLE'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new AIError('KEY_INVALID');
      if (response.status === 402) throw new AIError('OUT_OF_CREDITS');
      if (response.status === 429) { const seconds = Number(response.headers.get('retry-after')); throw new AIError('RATE_LIMITED', true, Number.isFinite(seconds) ? Math.min(2000, Math.max(0, seconds * 1000)) : 250); }
      // Retry only explicit rejection statuses; ambiguous transport/timeouts are never retried or charged as zero.
      if (response.status === 503) throw new AIError('PROVIDER_UNAVAILABLE', true);
      throw new AIError('PROVIDER_UNAVAILABLE');
    }
    try {
      const text = await response.text(); if (text.length > 1_000_000) throw new Error();
      const result = JSON.parse(text); if (!result || typeof result !== 'object' || Array.isArray(result) || result.error) throw new Error();
      return result;
    } catch { throw new AIError('PROVIDER_UNAVAILABLE'); }
  }
  async models(signal: AIAbortSignal): Promise<ModelCapability[]> {
    if (this.cached && this.now() - this.cached.at < 300_000) return this.cached.models;
    const result = await this.json('/models', signal);
    if (!Array.isArray(result.data)) throw new AIError('MODEL_UNSUPPORTED');
    const models = result.data.filter((model: ObjectValue) => typeof model.id === 'string' && Array.isArray(model.supported_parameters)
      && model.supported_parameters.includes('structured_outputs') && model.supported_parameters.includes('response_format')
      && count(model.context_length) && count(model.top_provider?.max_completion_tokens)
      && decimal(model.pricing?.prompt) && decimal(model.pricing?.completion) && decimal(model.pricing?.request ?? '0'))
      .map((model: ObjectValue) => ({ id: model.id, structuredOutput: true, contextTokens: model.context_length,
        maxOutputTokens: model.top_provider.max_completion_tokens, inputUsdPerToken: model.pricing.prompt,
        outputUsdPerToken: model.pricing.completion, requestUsd: model.pricing.request ?? '0' }));
    this.cached = { at: this.now(), models }; return models;
  }
  async validateKey(key: string, signal: AIAbortSignal): Promise<{ state: 'valid' | 'out_of_credits' }> {
    const result = await this.json('/key', signal, key);
    if (!result.data || typeof result.data !== 'object') throw new AIError('KEY_INVALID');
    if (result.data.expires_at && new Date(result.data.expires_at).getTime() <= this.now()) throw new AIError('KEY_EXPIRED');
    return { state: typeof result.data.limit_remaining === 'number' && result.data.limit_remaining <= 0 ? 'out_of_credits' : 'valid' };
  }
  async generate(request: AIRequest, key: string): Promise<AIResult> {
    const models = await this.models(request.signal); const model = models.find((item) => item.id === request.model);
    if (!model || request.maxOutputTokens > model.maxOutputTokens) throw new AIError('MODEL_UNSUPPORTED');
    const start = this.now();
    const result = await this.json('/chat/completions', request.signal, key, {
      model: request.model, stream: false, max_tokens: request.maxOutputTokens,
      messages: [{ role: 'system', content: request.instruction }, { role: 'user', content: JSON.stringify(request.input) }],
      response_format: { type: 'json_schema', json_schema: { name: request.schemaVersion.replace(/[^a-zA-Z0-9_-]/g, '_'), strict: true, schema: request.schema } },
      provider: { require_parameters: true, allow_fallbacks: false, data_collection: 'deny', zdr: request.requireZdr,
        max_price: { prompt: Number(model.inputUsdPerToken) * 1_000_000, completion: Number(model.outputUsdPerToken) * 1_000_000 } },
      reasoning: { exclude: true },
    });
    const choice = result.choices?.[0]; const usage = result.usage;
    if (!choice || typeof choice.message?.content !== 'string' || typeof choice.finish_reason !== 'string'
      || typeof result.id !== 'string' || typeof result.model !== 'string') throw new AIError('INVALID_OUTPUT');
    if (!usage || !count(usage.prompt_tokens) || !count(usage.completion_tokens) || !count(usage.total_tokens)
      || usage.total_tokens !== usage.prompt_tokens + usage.completion_tokens) throw new AIError('PROVIDER_UNAVAILABLE');
    const cost = typeof usage.cost === 'number' && Number.isFinite(usage.cost) && usage.cost >= 0 ? String(usage.cost) : usage.cost;
    const receipt: Omit<AIResult, 'output'> = { selectedModel: request.model, resolvedModel: result.model,
      resolvedProvider: typeof result.provider === 'string' ? result.provider.slice(0, 128) : null,
      finishReason: choice.finish_reason, providerRequestId: result.id.slice(0, 255), latencyMs: Math.max(0, this.now() - start),
      usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
        costUsd: decimal(cost) ? cost : null, costSource: decimal(cost) ? 'provider' : 'unavailable' },
    };
    let output: unknown;
    try { output = JSON.parse(choice.message.content); } catch { throw new AIError('INVALID_OUTPUT', false, undefined, receipt); }
    if (choice.finish_reason !== 'stop') throw new AIError('INVALID_OUTPUT', false, undefined, receipt);
    return { output, ...receipt };
  }
}
