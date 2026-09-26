import { describe, expect, it } from 'vitest';
import {
  assertContentTransition,
  assertProductTransition,
  canTransitionContent,
  canTransitionProduct,
} from '../../src/ccos/lifecycle';

describe('CCOS lifecycle invariants', () => {
  it('keeps receipt, production queue, production and publication distinct', () => {
    expect(canTransitionProduct('shipped', 'received')).toBe(true);
    expect(canTransitionProduct('received', 'content_queue')).toBe(true);
    expect(canTransitionProduct('content_queue', 'in_production')).toBe(true);
    expect(canTransitionProduct('in_production', 'content_live')).toBe(true);
  });

  it('does not allow publication to complete a product implicitly', () => {
    expect(canTransitionProduct('content_live', 'completed')).toBe(false);
    expect(() => assertProductTransition('content_live', 'completed')).toThrow(
      'Invalid CCOS product transition: content_live -> completed',
    );
  });

  it('allows repeat creative work after publication without completing the relationship', () => {
    expect(canTransitionProduct('content_live', 'in_production')).toBe(true);
    expect(canTransitionContent('published', 'monitoring')).toBe(true);
  });

  it('rejects invalid content shortcuts deterministically', () => {
    expect(() => assertContentTransition('idea', 'published')).toThrow(
      'Invalid CCOS content transition: idea -> published',
    );
  });
});
