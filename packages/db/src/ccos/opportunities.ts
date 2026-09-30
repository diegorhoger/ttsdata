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

export function validateOpportunityEvidence(reason: string, evidence: Record<string, unknown>) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000
    || !evidence || Array.isArray(evidence) || typeof evidence !== 'object'
    || Object.keys(evidence).length === 0 || JSON.stringify(evidence).length > 20000) {
    throw new OpportunityValidationError('A reason and non-empty evidence object (maximum 20000 characters) are required');
  }
}
