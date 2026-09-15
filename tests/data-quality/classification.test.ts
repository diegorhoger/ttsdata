import { describe, it, expect } from 'vitest';
import {
  MetricClassification,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_DESCRIPTIONS,
  getClassificationLabel,
  getClassificationDescription,
  isClassification,
} from '../../packages/data-quality/src/classification';

describe('Classification', () => {
  it('has all required classifications', () => {
    const expected: MetricClassification[] = [
      'observed', 'calculated', 'inferred', 'self-reported', 'unavailable',
    ];
    for (const c of expected) {
      expect(CLASSIFICATION_LABELS[c]).toBeDefined();
      expect(CLASSIFICATION_DESCRIPTIONS[c]).toBeDefined();
    }
  });

  it('returns correct labels', () => {
    expect(getClassificationLabel('observed')).toBe('Observed');
    expect(getClassificationLabel('calculated')).toBe('Calculated');
    expect(getClassificationLabel('inferred')).toBe('Inferred');
    expect(getClassificationLabel('self-reported')).toBe('Self-reported');
    expect(getClassificationLabel('unavailable')).toBe('Unavailable');
  });

  it('returns correct descriptions', () => {
    expect(getClassificationDescription('observed')).toContain('authorized');
    expect(getClassificationDescription('calculated')).toContain('transformation');
    expect(getClassificationDescription('inferred')).toContain('estimate');
    expect(getClassificationDescription('unavailable')).toContain('Not supported');
  });

  it('validates classification strings', () => {
    expect(isClassification('observed')).toBe(true);
    expect(isClassification('calculated')).toBe(true);
    expect(isClassification('invalid')).toBe(false);
  });
});
