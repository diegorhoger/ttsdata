import { describe, expect, it } from 'vitest';
import { comparePerformanceSnapshots, type PerformanceSnapshot } from '../../src/ccos/performance';

function snapshot(id: string, date: string, views: number | null): PerformanceSnapshot {
  return {
    id, workspaceId: 'w1', contentId: 'c1', productId: 'p1', observedAt: new Date(date),
    views, clicks: null, orders: null, gmv: null, commission: null, conversion: null, currency: null,
    classifications: { views: views === null ? 'unavailable' : 'observed', clicks: 'unavailable',
      orders: 'unavailable', gmv: 'unavailable', commission: 'unavailable', conversion: 'unavailable' },
    provenance: { schemaVersion: 1, source: 'test', metrics: {} }, createdAt: new Date(date),
  };
}

describe('CCOS performance comparisons', () => {
  it('uses the nearest snapshot on or before each exact window cutoff and preserves nulls', () => {
    const current = snapshot('now', '2026-09-30T12:00:00.000Z', 22);
    const candidates = [
      snapshot('just-after-cutoff', '2026-09-29T12:00:01.000Z', 5),
      snapshot('exact-cutoff', '2026-09-29T12:00:00.000Z', null),
      snapshot('older', '2026-09-28T12:00:00.000Z', 2),
      { ...snapshot('other-tenant', '2026-09-28T12:00:00.000Z', 1), workspaceId: 'w2' },
    ];
    const comparisons = comparePerformanceSnapshots([...candidates, current], current);
    expect(comparisons['24h'].baselineAt?.toISOString()).toBe('2026-09-29T12:00:00.000Z');
    expect(comparisons['24h'].values.views).toEqual({ current: 22, baseline: null, delta: null });
    expect(comparisons['48h'].values.views).toEqual({ current: 22, baseline: 2, delta: 20 });
    expect(comparisons['7d'].baselineAt).toBeNull();
    expect(comparisons['30d'].values.clicks).toEqual({ current: null, baseline: null, delta: null });
  });

  it('subtracts monetary and ratio values exactly at their stored precision', () => {
    const baseline = {
      ...snapshot('baseline', '2026-09-29T12:00:00.000Z', null),
      gmv: '0.100000', conversion: '0.10000000',
    };
    const current = {
      ...snapshot('current', '2026-09-30T12:00:00.000Z', null),
      gmv: '0.300000', conversion: '0.30000000',
    };
    const comparison = comparePerformanceSnapshots([baseline, current], current)['24h'];
    expect(comparison.values.gmv.delta).toBe('0.2');
    expect(comparison.values.conversion.delta).toBe('0.2');
  });
});
