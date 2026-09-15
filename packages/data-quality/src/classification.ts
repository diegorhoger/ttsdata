/**
 * Metric classification.
 * 
 * Every displayed metric must carry one of these classifications.
 * This is a core trust principle — users must know what they're looking at.
 */

export type MetricClassification =
  | 'observed'
  | 'calculated'
  | 'inferred'
  | 'self-reported'
  | 'unavailable';

export const CLASSIFICATION_LABELS: Record<MetricClassification, string> = {
  observed: 'Observed',
  calculated: 'Calculated',
  inferred: 'Inferred',
  'self-reported': 'Self-reported',
  unavailable: 'Unavailable',
};

export const CLASSIFICATION_DESCRIPTIONS: Record<MetricClassification, string> = {
  observed: 'Returned directly by an authorized official source',
  calculated: 'Deterministic transformation of observed values',
  inferred: 'Model-based estimate with methodology and confidence range',
  'self-reported': 'Entered or imported by the user',
  unavailable: 'Not supported by the source or authorization scope',
};

export function getClassificationLabel(c: MetricClassification): string {
  return CLASSIFICATION_LABELS[c];
}

export function getClassificationDescription(c: MetricClassification): string {
  return CLASSIFICATION_DESCRIPTIONS[c];
}

export function isClassification(c: string): c is MetricClassification {
  return ['observed', 'calculated', 'inferred', 'self-reported', 'unavailable'].includes(c);
}
