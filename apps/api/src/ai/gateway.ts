import { AIError, AI_DISCLOSURE_VERSION, AI_PROMPT_VERSION, AI_SCHEMA_VERSION, AI_SUMMARY_SCHEMA, matchesSchema, type AIKeyMode, type AIProvider, type AIResult } from '@ttsdata/shared';
import type { AIIdentity, AIRepository } from '@ttsdata/db';

export type AIGatewayStore = Pick<AIRepository, 'assertEnabled' | 'getConsent' | 'minimumInput' | 'credential' | 'reserve' | 'finalize'>;
export type GenerateInput = { correlationId: string; contentId: string; model: string; mode: AIKeyMode; maxOutputTokens: number; signal?: AbortSignal };
const instruction = 'Summarize only the supplied authorized performance metrics. Null means unavailable, never zero. Do not claim causation, reveal hidden reasoning, or include chain-of-thought. Return concise summary and at most five practical recommendations using the supplied JSON schema.';
const units = (value: string) => { const [integer, fraction = ''] = value.split('.'); return BigInt(integer) * 1_000_000_000_000n + BigInt(fraction.padEnd(12, '0')); };
const usd = (value: bigint) => `${value / 1_000_000_000_000n}.${(value % 1_000_000_000_000n).toString().padStart(12, '0')}`;

/** Product services depend on AIProvider, never on OpenRouter types. Fallback is deliberately disabled across all modes/models. */
export class AIGateway {
  private readonly breakers = new Map<string, { failures: number; until: number }>();
  constructor(private readonly provider: AIProvider, private readonly store: AIGatewayStore,
    private readonly enabled: () => boolean = () => process.env.AI_ENABLED === 'true', private readonly timeoutMs = 30_000, private readonly now = Date.now) {}
  async generate(identity: AIIdentity, input: GenerateInput): Promise<AIResult & { correlationId: string; promptVersion: string; schemaVersion: string }> {
    if (!this.enabled()) throw new AIError('DISABLED');
    if (!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 32 || input.maxOutputTokens > 2048) throw new AIError('INVALID_REQUEST');
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort(); input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) controller.abort();
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    let reserved = false; let attempts = 0; let result: AIResult | undefined; let failure: AIError | undefined;
    const start = this.now(); let breakerKey = '';
    const checkAbort = () => { if (controller.signal.aborted) throw new AIError(timedOut ? 'TIMEOUT' : 'CANCELLED'); };
    try {
      checkAbort(); await this.store.assertEnabled(identity, input.mode);
      const consent = await this.store.getConsent(identity); if (consent?.version !== AI_DISCLOSURE_VERSION) throw new AIError('CONSENT_REQUIRED');
      const minimumInput = await this.store.minimumInput(identity, input.contentId);
      const credential = await this.store.credential(identity, input.mode);
      breakerKey = `${identity.workspaceId}:${identity.userId}:${credential.id}:${credential.revision}`;
      const breaker = this.breakers.get(breakerKey); if (breaker && breaker.until > this.now()) throw new AIError('CIRCUIT_OPEN');
      checkAbort(); const models = await this.provider.models(controller.signal); checkAbort();
      const model = models.find((item) => item.id === input.model && item.structuredOutput);
      const inputTokens = Buffer.byteLength(JSON.stringify(minimumInput) + instruction + JSON.stringify(AI_SUMMARY_SCHEMA), 'utf8') + 1024;
      if (!model || input.maxOutputTokens > model.maxOutputTokens || inputTokens + input.maxOutputTokens > model.contextTokens) throw new AIError('MODEL_UNSUPPORTED');
      const estimatedTokens = inputTokens + input.maxOutputTokens;
      const estimate = units(model.inputUsdPerToken) * BigInt(inputTokens) + units(model.outputUsdPerToken) * BigInt(input.maxOutputTokens) + units(model.requestUsd);
      // Reserve every possible attempt up front. Failure/unknown usage is charged conservatively, not zero.
      await this.store.reserve(identity, { id: input.correlationId, model: input.model, mode: input.mode, requests: 3, tokens: estimatedTokens * 3, costUsd: usd(estimate * 3n) }); reserved = true;
      for (let attempt = 0; attempt < 3; attempt++) {
        checkAbort(); if (!this.enabled()) throw new AIError('DISABLED'); await this.store.assertEnabled(identity, input.mode);
        const current = await this.store.credential(identity, input.mode);
        if (current.id !== credential.id || current.revision !== credential.revision) throw new AIError('KEY_DISABLED');
        attempts++;
        try {
          result = await this.provider.generate({ correlationId: input.correlationId, model: input.model, promptVersion: AI_PROMPT_VERSION,
            schemaVersion: AI_SCHEMA_VERSION, schema: AI_SUMMARY_SCHEMA, instruction, input: minimumInput, maxOutputTokens: input.maxOutputTokens,
            requireZdr: consent.requireZdr, signal: controller.signal }, current.key);
          checkAbort(); break;
        } catch (error) {
          const safe = error instanceof AIError ? error : new AIError('PROVIDER_UNAVAILABLE');
          // Invalid/truncated output may still carry a safe usage receipt; preserve billable metadata, never the raw output.
          if (safe.receipt) result = { ...safe.receipt, output: null };
          if (!safe.retryable || attempt === 2 || controller.signal.aborted) throw safe;
          await new Promise<void>((resolve, reject) => {
            const onAbort = () => { clearTimeout(wait); reject(new AIError('CANCELLED')); };
            const wait = setTimeout(() => { controller.signal.removeEventListener('abort', onAbort); resolve(); }, Math.min(2000, safe.retryAfterMs ?? 250 * (attempt + 1)));
            controller.signal.addEventListener('abort', onAbort, { once: true });
            if (controller.signal.aborted) onAbort();
          });
        }
      }
      if (!result || result.selectedModel !== input.model || result.resolvedModel !== input.model || result.finishReason !== 'stop'
        || !matchesSchema(AI_SUMMARY_SCHEMA, result.output)) throw new AIError('INVALID_OUTPUT');
      if (!Number.isSafeInteger(result.usage.totalTokens) || result.usage.totalTokens !== result.usage.inputTokens + result.usage.outputTokens
        || result.usage.inputTokens < 0 || result.usage.outputTokens < 0) throw new AIError('PROVIDER_UNAVAILABLE');
      this.breakers.delete(breakerKey);
      return { ...result, correlationId: input.correlationId, promptVersion: AI_PROMPT_VERSION, schemaVersion: AI_SCHEMA_VERSION };
    } catch (error) {
      failure = timedOut ? new AIError('TIMEOUT') : controller.signal.aborted ? new AIError('CANCELLED') : error instanceof AIError ? error : new AIError('PROVIDER_UNAVAILABLE');
      if (breakerKey && ['TIMEOUT', 'PROVIDER_UNAVAILABLE', 'INVALID_OUTPUT'].includes(failure.code)) {
        const failures = (this.breakers.get(breakerKey)?.failures ?? 0) + 1; this.breakers.set(breakerKey, { failures, until: failures >= 3 ? this.now() + 30_000 : 0 });
      }
      throw failure;
    } finally {
      clearTimeout(timer); input.signal?.removeEventListener('abort', abort);
      if (reserved) await this.store.finalize(identity, { id: input.correlationId, mode: input.mode, model: input.model, provider: this.provider.id,
        promptVersion: AI_PROMPT_VERSION, schemaVersion: AI_SCHEMA_VERSION, attempts, latencyMs: Math.max(0, this.now() - start),
        result, errorCode: failure?.code, unknown: result ? result.usage.costUsd === null : attempts > 0 && !['KEY_INVALID', 'KEY_EXPIRED', 'KEY_DISABLED', 'OUT_OF_CREDITS', 'RATE_LIMITED', 'DISABLED'].includes(failure?.code ?? '') });
    }
  }
}
