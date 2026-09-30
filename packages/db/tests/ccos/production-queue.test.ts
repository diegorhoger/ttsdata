import { describe, expect, it } from 'vitest';
import { orderProductionQueue, scoreProductionCandidate, type QueueCandidate } from '../../src/ccos/production-queue';

const now = new Date('2026-09-30T12:00:00Z');
const candidate: QueueCandidate = {
  id: 'a', name: 'Product', status: 'received', priority: 'normal', stockState: null,
  commissionRate: null, updatedAt: now, provenance: { source: 'manual' },
  conversion: null, performanceAt: null, performanceSource: null, performanceClassification: null,
  performanceProvenance: null, responsiveness: null, responseAt: null,
};
const score = (override: Partial<QueueCandidate> = {}) => scoreProductionCandidate({ ...candidate, ...override }, now);

describe('CCOS deterministic production prioritization', () => {
  it('keeps missing commission distinct from an explicit zero and returns coverage', () => {
    const missing = score(); const zero = score({ commissionRate: '0' });
    expect(missing.components.commission.score).toBeNull();
    expect(zero.components.commission.score).toBe(0);
    expect(missing.coverage).toBe(20); expect(zero.coverage).toBe(45);
    expect(missing.score).toBe(33); expect(zero.score).toBe(14.667);
    expect(orderProductionQueue([missing, zero], [], { missing: 'only', signal: 'commission' })).toEqual([missing]);
    expect(orderProductionQueue([missing, zero], [], { missing: 'exclude', signal: 'commission' })).toEqual([zero]);
  });
  it('sorts known low values ahead of unknown values without classifying unknown as poor', () => {
    const missing = score({ id: 'a' }); const zero = score({ id: 'b', conversion: '0' });
    expect(orderProductionQueue([missing, zero], [], { sort: 'performance' }).map((item) => item.id)).toEqual(['b', 'a']);
    expect(missing.components.performance.classification).toBe('unavailable');
  });
  it('has deterministic ID ties independent of arrival/input order', () => {
    const a = score(); const b = score({ id: 'b' });
    for (const sort of ['score', 'commission', 'stock', 'performance', 'responsiveness', 'strategic'] as const) {
      expect(orderProductionQueue([b, a], [], { sort }).map((item) => item.id)).toEqual(['a', 'b']);
    }
    expect(score()).toEqual(score()); expect(score().scoreVersion).toBe('ccos-production-v1');
  });
  it('returns versioned components with weight, provenance, observation time and freshness', () => {
    const item = score({ conversion: '0.25', performanceAt: new Date('2026-09-20'), performanceSource: 'verified-api',
      performanceClassification: 'observed', performanceProvenance: { snapshot: 'snapshot-id' } });
    expect(item.components.performance).toMatchObject({ value: '0.25', score: 25, weight: 25,
      source: 'verified-api', classification: 'observed', provenance: { snapshot: 'snapshot-id' }, freshness: 'stale' });
    expect(item.components.commission.freshness).toBe('unknown');
  });
  it('honors manual order before score and handles newly eligible/missing manual entries', () => {
    const a = score({ commissionRate: '100' }); const b = score({ id: 'b', commissionRate: '0' });
    expect(orderProductionQueue([a, b], ['b', 'deleted']).map((item) => item.id)).toEqual(['b', 'a']);
    expect(orderProductionQueue([a, b], ['b'], { sort: 'score' }).map((item) => item.id)).toEqual(['a', 'b']);
  });
  it('filters explicit stock/strategic values and treats unrecognized stock as missing', () => {
    const a = score({ stockState: 'in_stock', priority: 'high' });
    const b = score({ id: 'b', stockState: 'unknown' });
    expect(b.components.stock.score).toBeNull();
    expect(orderProductionQueue([a, b], [], { stockState: 'in_stock', priority: 'high' })).toEqual([a]);
  });
  it.each(['constructor', 'toString', '__proto__'])('treats inherited-key stock %s as missing', (stockState) => {
    const item = score({ stockState });
    expect(item.components.stock.score).toBeNull();
    expect(Number.isFinite(item.score!)).toBe(true);
  });
  it.each(['NaN', 'Infinity', '-1', '1e3', '1000'])('rejects invalid commission %s', (commissionRate) => {
    expect(() => score({ commissionRate })).toThrow();
  });
  it.each(['NaN', 'Infinity', '-1', '1.01'])('rejects invalid conversion %s', (conversion) => {
    expect(() => score({ conversion })).toThrow();
  });
  it.each([NaN, Infinity, -1, 101])('rejects invalid responsiveness %s', (responsiveness) => {
    expect(() => score({ responsiveness })).toThrow();
  });
});
