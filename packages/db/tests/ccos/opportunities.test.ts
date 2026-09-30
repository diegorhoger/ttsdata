import { describe, expect, it } from 'vitest';
import { OPPORTUNITY_ACTIONS, OPPORTUNITY_POLICY, OPPORTUNITY_STATES, OpportunityValidationError, opportunityEvidenceTextLength, validateOpportunityEvidence } from '../../src/ccos/opportunities';

describe('manual opportunity policy', () => {
  it('keeps opportunity assessment distinct from operational completion', () => {
    expect(OPPORTUNITY_STATES).toEqual(['UNASSESSED', 'TESTING', 'LOW_POTENTIAL', 'PROMISING', 'WINNER', 'SCALE', 'PAUSED']);
    expect(OPPORTUNITY_STATES).not.toContain('completed');
    expect(OPPORTUNITY_ACTIONS).toEqual(['follow_up', 'replenishment', 'additional_sku', 'new_creative', 'expansion']);
    expect(OPPORTUNITY_POLICY).toEqual({ version: 'manual-v1', mode: 'manual', automatedSuggestions: false, autonomousMerchantContact: false });
  });
  it('requires concrete human reasons and bounded evidence, preserving null vs zero', () => {
    expect(() => validateOpportunityEvidence('Manual review', { observedOrders: 0, unknownCommission: null })).not.toThrow();
    for (const evidence of [{}, [], null, { notes: 'x'.repeat(20001) }]) {
      expect(() => validateOpportunityEvidence('Manual review', evidence as Record<string, unknown>)).toThrow(OpportunityValidationError);
    }
    expect(() => validateOpportunityEvidence(' ', { note: 'Review' })).toThrow(OpportunityValidationError);
  });
  it('uses PostgreSQL jsonb text sizing at the dense-array boundary', () => {
    const dense = { samples: Array(8000).fill(1) };
    expect(JSON.stringify(dense).length).toBeLessThan(20000);
    expect(opportunityEvidenceTextLength(dense)).toBeGreaterThan(20000);
    expect(() => validateOpportunityEvidence('Dense evidence', dense)).toThrow(OpportunityValidationError);
  });
});
