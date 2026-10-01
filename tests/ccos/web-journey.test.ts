import { describe, expect, it } from 'vitest';
import { contentTransitions, partnershipTransitions, productTransitions } from '../../apps/web/src/lib/ccos-transitions';

function expectPath(transitions: Record<string, readonly string[]>, path: readonly string[]) {
  for (let index = 0; index < path.length - 1; index += 1) {
    expect(transitions[path[index]], `${path[index]} -> ${path[index + 1]}`).toContain(path[index + 1]);
  }
}

describe('CCOS beta operator journey', () => {
  it('exposes the canonical lead, sample, production and monitoring path', () => {
    expectPath(partnershipTransitions, ['lead', 'contacted', 'negotiating', 'active']);
    expectPath(productTransitions, [
      'proposed', 'selected', 'sample_requested', 'sample_approved', 'shipped', 'received',
      'content_queue', 'in_production', 'content_live', 'monitoring',
    ]);
    expectPath(contentTransitions, ['idea', 'planned', 'filming', 'editing', 'ready', 'published', 'ads_authorized', 'monitoring']);
  });

  it('does not offer terminal-state transitions in the operator UI', () => {
    expect(partnershipTransitions.completed).toEqual([]);
    expect(productTransitions.completed).toEqual([]);
    expect(contentTransitions.monitoring).toEqual([]);
  });
});
