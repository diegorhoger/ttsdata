import { describe, expect, it } from 'vitest';
import {
  assertContentTransition,
  assertPartnershipTransition,
  assertProductTransition,
  canTransitionContent,
  canTransitionPartnership,
  canTransitionProduct,
} from '../../src/ccos/lifecycle';

describe('CCOS lifecycle invariants', () => {
  it('advances partnerships through explicit commercial phases', () => {
    expect(canTransitionPartnership('lead', 'contacted')).toBe(true);
    expect(canTransitionPartnership('contacted', 'negotiating')).toBe(true);
    expect(canTransitionPartnership('negotiating', 'active')).toBe(true);
  });

  it('keeps waiting and paused partnerships resumable', () => {
    expect(canTransitionPartnership('active', 'waiting')).toBe(true);
    expect(canTransitionPartnership('waiting', 'active')).toBe(true);
    expect(canTransitionPartnership('paused', 'negotiating')).toBe(true);
  });

  it('rejects skipped and terminal partnership transitions', () => {
    expect(() => assertPartnershipTransition('lead', 'active')).toThrow(
      'Invalid CCOS partnership transition: lead -> active',
    );
    expect(() => assertPartnershipTransition('completed', 'active')).toThrow(
      'Invalid CCOS partnership transition: completed -> active',
    );
  });

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
