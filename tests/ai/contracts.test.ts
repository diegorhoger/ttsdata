import { describe, expect, it } from 'vitest';
import { AIError, FakeAIProvider, matchesSchema, type AIRequest, type JSONSchema } from '../../packages/shared/src/ai';

const request = (signal = new AbortController().signal): AIRequest => ({
  correlationId: 'test-correlation', model: 'fake/summary', promptVersion: 'prompt.v1', schemaVersion: 'schema.v1',
  schema: { type: 'object' }, instruction: 'summarize metrics', input: { views: 10 }, maxOutputTokens: 100,
  requireZdr: true, signal,
});

describe('AI contracts', () => {
  it('enforces required fields, additional-property policy, and supported value constraints', () => {
    const schema: JSONSchema = { type: 'object', properties: { name: { type: 'string', maxLength: 4 }, score: { type: 'integer', minimum: 0 } }, required: ['name', 'score'], additionalProperties: false };
    expect(matchesSchema(schema, { name: 'Ada', score: 2 })).toBe(true);
    expect(matchesSchema(schema, { name: 'Ada' })).toBe(false);
    expect(matchesSchema(schema, { name: 'Longer', score: 2 })).toBe(false);
    expect(matchesSchema(schema, { name: 'Ada', score: 2, extra: true })).toBe(false);
    expect(matchesSchema({ type: 'object', properties: { name: { type: 'string' } } }, { name: 'Ada', extra: true })).toBe(true);
  });

  it('rejects schema structures deeper than the supported recursion limit', () => {
    let schema: JSONSchema = { type: 'string' };
    let value: unknown = 'bottom';
    for (let i = 0; i < 33; i += 1) {
      schema = { type: 'object', properties: { child: schema }, required: ['child'], additionalProperties: false };
      value = { child: value };
    }
    expect(matchesSchema(schema, value)).toBe(false);
  });

  it('provides deterministic fake results and records the request without retaining credentials', async () => {
    const provider = new FakeAIProvider({ summary: 'ok', recommendations: [] });
    const req = request();
    const result = await provider.generate(req, 'should-not-be-recorded');
    expect(provider.id).toBe('fake');
    expect(provider.requests).toEqual([req]);
    expect(result.output).toEqual({ summary: 'ok', recommendations: [] });
    expect(JSON.stringify(provider.requests)).not.toContain('should-not-be-recorded');
  });

  it('does not accept an already-aborted fake request', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new FakeAIProvider();
    await expect(provider.generate(request(controller.signal), 'credential')).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(provider.requests).toHaveLength(0);
  });
});
