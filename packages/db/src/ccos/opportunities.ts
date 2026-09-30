/** V1 is deliberately manual: no thresholds, metric inference, or merchant contact. */
export const OPPORTUNITY_STATES = ['UNASSESSED', 'TESTING', 'LOW_POTENTIAL', 'PROMISING', 'WINNER', 'SCALE', 'PAUSED'] as const;
export type OpportunityState = typeof OPPORTUNITY_STATES[number];
export const OPPORTUNITY_ACTIONS = ['follow_up', 'replenishment', 'additional_sku', 'new_creative', 'expansion'] as const;
export type OpportunityAction = typeof OPPORTUNITY_ACTIONS[number];
export const OPPORTUNITY_POLICY = Object.freeze({ version: 'manual-v1', mode: 'manual', automatedSuggestions: false, autonomousMerchantContact: false });

export interface OpportunityDecision {
  expectedRevision: number;
  state: OpportunityState;
  reason: string;
  /** Operator-supplied evidence, never represented as observed performance. */
  evidence: Record<string, unknown>;
}
export interface OpportunityActionInput {
  kind: OpportunityAction;
  title: string;
  reason: string;
  evidence: Record<string, unknown>;
  dueAt?: Date;
}
export class OpportunityValidationError extends Error {}
export class OpportunityConflict extends Error {}
export class OpportunityNotFound extends Error {}

/** Upper-bound PostgreSQL jsonb::text length, including structural spaces. */
export function opportunityEvidenceTextLength(value: unknown): number {
  if (value === null || typeof value === 'boolean') return String(value).length;
  if (typeof value === 'string') return JSON.stringify(value).length;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return Infinity;
    const rendered = JSON.stringify(value);
    // PostgreSQL numeric text expands the smallest negative subnormal to 327 chars.
    return /e/i.test(rendered) ? 327 : rendered.length;
  }
  if (Array.isArray(value)) return 2 + value.reduce((length, item, index) => length
    + (index ? 2 : 0) + opportunityEvidenceTextLength(item === undefined ? null : item), 0);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined
      && typeof item !== 'function' && typeof item !== 'symbol');
    return 2 + entries.reduce((length, [key, item], index) => length + (index ? 2 : 0)
      + JSON.stringify(key).length + 2 + opportunityEvidenceTextLength(item), 0);
  }
  return Infinity;
}

export function isValidOpportunityEvidence(evidence: unknown): evidence is Record<string, unknown> {
  return Boolean(evidence) && !Array.isArray(evidence) && typeof evidence === 'object'
    && Object.keys(evidence as object).length > 0 && opportunityEvidenceTextLength(evidence) <= 20000;
}

export function validateOpportunityEvidence(reason: string, evidence: Record<string, unknown>) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000
    || !isValidOpportunityEvidence(evidence)) {
    throw new OpportunityValidationError('A reason and non-empty evidence object (maximum 20000 characters) are required');
  }
}
