/** Provider-neutral, versioned inference boundary. No provider wire types or credentials enter product contracts. */
export type AIErrorCode = 'DISABLED' | 'CONSENT_REQUIRED' | 'KEY_MISSING' | 'KEY_DISABLED' | 'KEY_INVALID' | 'KEY_EXPIRED' | 'OUT_OF_CREDITS' | 'RATE_LIMITED' | 'LIMIT_EXCEEDED' | 'CIRCUIT_OPEN' | 'MODEL_UNSUPPORTED' | 'INVALID_OUTPUT' | 'TIMEOUT' | 'CANCELLED' | 'PROVIDER_UNAVAILABLE' | 'INVALID_REQUEST';
const messages: Record<AIErrorCode, string> = {
  DISABLED: 'AI is disabled.', CONSENT_REQUIRED: 'Review and accept the AI privacy disclosure.', KEY_MISSING: 'Add an AI key.',
  KEY_DISABLED: 'This AI key is disabled.', KEY_INVALID: 'The AI key is invalid.', KEY_EXPIRED: 'The AI key has expired.',
  OUT_OF_CREDITS: 'The selected AI account has no remaining credits.', RATE_LIMITED: 'The AI provider is rate limited.',
  LIMIT_EXCEEDED: 'Your AI usage limit was reached.', CIRCUIT_OPEN: 'AI is temporarily unavailable.', MODEL_UNSUPPORTED: 'The model cannot meet the requested capability or privacy requirements.',
  INVALID_OUTPUT: 'The AI response did not match the required schema.', TIMEOUT: 'The AI request timed out.', CANCELLED: 'The AI request was cancelled.',
  PROVIDER_UNAVAILABLE: 'The AI provider is unavailable.', INVALID_REQUEST: 'The AI request is invalid.',
};
export class AIError extends Error {
  constructor(public readonly code: AIErrorCode, public readonly retryable = false, public readonly retryAfterMs?: number,
    public readonly receipt?: Omit<AIResult, 'output'>) { super(messages[code]); this.name = 'AIError'; }
}
export type AIKeyMode = 'platform' | 'byok';
export type ModelCapability = { id: string; structuredOutput: boolean; contextTokens: number; maxOutputTokens: number; inputUsdPerToken: string; outputUsdPerToken: string; requestUsd: string };
export type JSONSchema = { type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'; properties?: Record<string, JSONSchema>; required?: readonly string[]; additionalProperties?: false; items?: JSONSchema; maxItems?: number; maxLength?: number; minimum?: number; maximum?: number; enum?: readonly unknown[] };
export interface AIAbortSignal { readonly aborted: boolean; addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void; removeEventListener(type: 'abort', listener: () => void): void }
export type AIRequest = { correlationId: string; model: string; promptVersion: string; schemaVersion: string; schema: JSONSchema; instruction: string; input: Record<string, number | null>; maxOutputTokens: number; requireZdr: boolean; signal: AIAbortSignal };
export type AIUsage = { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: string | null; costSource: 'provider' | 'unavailable' };
export type AIResult = { output: unknown; selectedModel: string; resolvedModel: string; resolvedProvider: string | null; finishReason: string; providerRequestId: string; latencyMs: number; usage: AIUsage };
export interface AIProvider {
  readonly id: string;
  models(signal: AIAbortSignal): Promise<ModelCapability[]>;
  validateKey(key: string, signal: AIAbortSignal): Promise<{ state: 'valid' | 'out_of_credits' }>;
  generate(request: AIRequest, credential: string): Promise<AIResult>;
}
/** Supported JSON Schema subset is explicit. Product schemas are server-owned and versioned, never supplied by clients. */
export function matchesSchema(schema: JSONSchema, value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) return false;
  if (schema.type === 'null') return value === null;
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'string') return typeof value === 'string' && (schema.maxLength === undefined || value.length <= schema.maxLength);
  if (schema.type === 'number' || schema.type === 'integer') return typeof value === 'number' && Number.isFinite(value)
    && (schema.type !== 'integer' || Number.isSafeInteger(value)) && (schema.minimum === undefined || value >= schema.minimum) && (schema.maximum === undefined || value <= schema.maximum);
  if (schema.type === 'array') return Array.isArray(value) && (schema.maxItems === undefined || value.length <= schema.maxItems)
    && Boolean(schema.items) && value.every((item) => matchesSchema(schema.items!, item, depth + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return (schema.required ?? []).every((key) => Object.prototype.hasOwnProperty.call(object, key))
    && Object.entries(object).every(([key, item]) => schema.properties?.[key] ? matchesSchema(schema.properties[key], item, depth + 1) : schema.additionalProperties !== false);
}
export const AI_SUMMARY_SCHEMA: JSONSchema = { type: 'object', properties: {
  summary: { type: 'string', maxLength: 1200 }, recommendations: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 400 } },
}, required: ['summary', 'recommendations'], additionalProperties: false };
export const AI_SCHEMA_VERSION = 'performance-summary.v1';
export const AI_PROMPT_VERSION = 'minimum-metrics.v1';
export const AI_DISCLOSURE_VERSION = 'openrouter-minimum-metrics.v1';
export const AI_DISCLOSURE = Object.freeze({ version: AI_DISCLOSURE_VERSION,
  fields: ['views', 'clicks', 'orders', 'conversion'], excluded: ['access tokens', 'external IDs', 'avatars', 'email', 'account identifiers', 'unrelated tenant data'],
  processors: ['OpenRouter', 'the selected downstream model provider'],
  retention: 'OpenRouter/downstream retention varies by provider and account policy. ZDR routing is required by default. In-memory caching may still occur. Review provider policies before opting out.',
  policyUrls: ['https://openrouter.ai/docs/guides/privacy/provider-logging', 'https://openrouter.ai/docs/guides/features/zdr'],
  costResponsibility: { byok: 'Charged to your OpenRouter account; not OpenRouter provider-key BYOK.', platform: 'Charged to TTSData only when explicitly entitled and enabled.' },
  fallback: 'No automatic switch of key, account, provider or model. Retried requests use the same selected model and key.',
  storage: 'No prompt, output, hidden reasoning or key is stored in the usage ledger. Metadata and usage are retained.',
});
export class FakeAIProvider implements AIProvider {
  readonly id = 'fake'; readonly requests: AIRequest[] = [];
  constructor(private readonly result: unknown = { summary: 'Recorded metrics reviewed.', recommendations: [] }) {}
  async models(): Promise<ModelCapability[]> { return [{ id: 'fake/summary', structuredOutput: true, contextTokens: 4096, maxOutputTokens: 1024, inputUsdPerToken: '0', outputUsdPerToken: '0', requestUsd: '0' }]; }
  async validateKey(): Promise<{ state: 'valid' }> { return { state: 'valid' }; }
  async generate(request: AIRequest): Promise<AIResult> {
    if (request.signal.aborted) throw new AIError('CANCELLED'); this.requests.push(request);
    return { output: this.result, selectedModel: request.model, resolvedModel: request.model, resolvedProvider: 'fake', finishReason: 'stop',
      providerRequestId: request.correlationId, latencyMs: 0, usage: { inputTokens: 20, outputTokens: 20, totalTokens: 40, costUsd: '0', costSource: 'provider' } };
  }
}
