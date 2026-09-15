/**
 * Provenance contract.
 * 
 * Every material metric must carry provenance information:
 * - Source (where it came from)
 * - Retrieval time (when it was collected)
 * - Marketplace (which market)
 * - Scope context (what authorization was used)
 * - Metric classification (observed, calculated, inferred, etc.)
 */

export type MetricClassification =
  | 'observed'
  | 'calculated'
  | 'inferred'
  | 'self-reported'
  | 'unavailable';

export interface DataProvenance {
  /** Source identifier (e.g., "tiktok_shop_api:v202309") */
  source: string;
  /** Endpoint or collection method */
  endpoint: string;
  /** ISO 8601 UTC timestamp of when data was retrieved */
  retrievedAt: string;
  /** Marketplace code (e.g., "BR") */
  marketplace: string;
  /** Authorization scope context */
  scopeContext: string;
  /** Metric classification */
  metricClassification: MetricClassification;
  /** Optional reference to raw payload (bounded retention) */
  rawPayloadRef?: string;
}

export interface WithProvenance<T> {
  value: T;
  provenance: DataProvenance;
  classification: MetricClassification;
}

/**
 * Create provenance for an observed metric.
 */
export function createObservedProvenance(
  source: string,
  endpoint: string,
  marketplace: string,
  scopeContext: string
): DataProvenance {
  return {
    source,
    endpoint,
    retrievedAt: new Date().toISOString(),
    marketplace,
    scopeContext,
    metricClassification: 'observed',
  };
}

/**
 * Create provenance for a calculated metric.
 */
export function createCalculatedProvenance(
  source: string,
  endpoint: string,
  marketplace: string,
  scopeContext: string,
  rawPayloadRef?: string
): DataProvenance {
  return {
    source,
    endpoint,
    retrievedAt: new Date().toISOString(),
    marketplace,
    scopeContext,
    metricClassification: 'calculated',
    rawPayloadRef,
  };
}

/**
 * Create provenance for an inferred metric.
 */
export function createInferredProvenance(
  source: string,
  endpoint: string,
  marketplace: string,
  scopeContext: string,
  rawPayloadRef?: string
): DataProvenance {
  return {
    source,
    endpoint,
    retrievedAt: new Date().toISOString(),
    marketplace,
    scopeContext,
    metricClassification: 'inferred',
    rawPayloadRef,
  };
}

/**
 * Create provenance for an unavailable metric.
 */
export function createUnavailableProvenance(
  source: string,
  endpoint: string,
  marketplace: string,
  scopeContext: string
): DataProvenance {
  return {
    source,
    endpoint,
    retrievedAt: new Date().toISOString(),
    marketplace,
    scopeContext,
    metricClassification: 'unavailable',
  };
}
