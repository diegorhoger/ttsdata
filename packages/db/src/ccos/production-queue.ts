/** Versioned V1 policy. Missing evidence is excluded, never scored as zero.
 * Scores are normalized over available weights; coverage is returned separately.
 * Currency amounts are deliberately not compared across currencies.
 */
export const PRODUCTION_SCORE_VERSION = 'ccos-production-v1' as const;
export const QUEUE_SIGNALS = ['commission', 'stock', 'performance', 'responsiveness', 'strategic'] as const;
export type QueueSignal = typeof QUEUE_SIGNALS[number];
export type QueueComponent = {
  value: string | number | null;
  score: number | null;
  weight: number;
  source: string;
  observedAt: Date | null;
  classification: string;
  provenance: unknown;
  freshness: 'fresh' | 'stale' | 'unknown';
};
export type QueueCandidate = {
  id: string; name: string; status: string; priority: string; stockState: string | null;
  commissionRate: string | null; updatedAt: Date; provenance: unknown;
  conversion: string | null; performanceAt: Date | null; performanceSource: string | null;
  performanceClassification: string | null; performanceProvenance: unknown;
  responsiveness: number | null; responseAt: Date | null;
};
const priorities: Record<string, number> = { low: 0, normal: 33, high: 67, urgent: 100 };
const stocks: Record<string, number> = { in_stock: 100, low_stock: 40, out_of_stock: 0 };
const weights: Record<QueueSignal, number> = { commission: 25, stock: 20, performance: 25, responsiveness: 10, strategic: 20 };
export function scoreProductionCandidate(candidate: QueueCandidate, asOf: Date) {
  if (!Number.isFinite(asOf.getTime())) throw new Error('Invalid production scoring timestamp');
  const decimal = (value: string | null, maximum: number): number | null => {
    if (value === null) return null;
    if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid production scoring decimal');
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > maximum) throw new Error('Invalid production scoring range');
    return number;
  };
  const commissionRate = decimal(candidate.commissionRate, 999.999999);
  const conversion = decimal(candidate.conversion, 1);
  if (candidate.responsiveness !== null && (!Number.isFinite(candidate.responsiveness)
    || candidate.responsiveness < 0 || candidate.responsiveness > 100)) throw new Error('Invalid responsiveness score');
  const component = (signal: QueueSignal, value: QueueComponent['value'], score: number | null,
    source: string, observedAt: Date | null, classification: string, provenance: unknown): QueueComponent => ({
    value, score, weight: weights[signal], source, observedAt, classification, provenance,
    freshness: observedAt === null ? 'unknown' : asOf.getTime() - observedAt.getTime() > 7 * 86400000 ? 'stale' : 'fresh',
  });
  // commission_rate is a percentage; conversion is a ratio. Both saturate at 100.
  const components: Record<QueueSignal, QueueComponent> = {
    commission: component('commission', candidate.commissionRate,
      commissionRate === null ? null : Math.min(100, commissionRate),
      'product.commission_rate', null, 'self-reported', candidate.provenance),
    stock: component('stock', candidate.stockState, candidate.stockState === null ? null : stocks[candidate.stockState] ?? null,
      'product.stock_state', null, 'self-reported', candidate.provenance),
    performance: component('performance', candidate.conversion,
      conversion === null ? null : conversion * 100,
      candidate.performanceSource ?? 'unavailable', candidate.performanceAt,
      candidate.performanceClassification ?? 'unavailable', candidate.performanceProvenance),
    responsiveness: component('responsiveness', candidate.responsiveness, candidate.responsiveness,
      'partnership.interactions.inbound_share', candidate.responseAt, 'calculated',
      { policy: 'inbound / (inbound + outbound) over all recorded interactions; not response-time inference' }),
    strategic: component('strategic', candidate.priority, priorities[candidate.priority] ?? null,
      'product.priority', null, 'self-reported', candidate.provenance),
  };
  const known = Object.values(components).filter((item) => item.score !== null);
  const coverage = known.reduce((sum, item) => sum + item.weight, 0);
  const score = coverage === 0 ? null : Math.round(known.reduce((sum, item) => sum + item.score! * item.weight, 0) / coverage * 1000) / 1000;
  return { ...candidate, scoreVersion: PRODUCTION_SCORE_VERSION, score, coverage, components };
}
export type ProductionQueueItem = ReturnType<typeof scoreProductionCandidate>;
export type ProductionQueueOptions = { sort?: 'manual' | 'score' | QueueSignal; missing?: 'include' | 'only' | 'exclude'; signal?: QueueSignal; stockState?: string; priority?: string; asOf?: Date };
export function orderProductionQueue(items: ProductionQueueItem[], manualOrder: string[], options: ProductionQueueOptions = {}) {
  const sort = options.sort ?? 'manual';
  const ranked = new Map(manualOrder.map((id, index) => [id, index]));
  const value = (item: ProductionQueueItem) => sort === 'score' || sort === 'manual' ? item.score : item.components[sort].score;
  return items.filter((item) => {
    if (options.stockState && item.stockState !== options.stockState) return false;
    if (options.priority && item.priority !== options.priority) return false;
    const missing = options.signal ? item.components[options.signal].score === null : item.coverage < 100;
    return options.missing === 'only' ? missing : options.missing === 'exclude' ? !missing : true;
  }).sort((a, b) => {
    if (sort === 'manual') {
      const difference = (ranked.get(a.id) ?? Infinity) - (ranked.get(b.id) ?? Infinity);
      if (!Number.isNaN(difference) && difference !== 0) return difference;
    }
    const av = value(a); const bv = value(b);
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    return (bv ?? 0) - (av ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
