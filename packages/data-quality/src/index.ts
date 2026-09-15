/**
 * TTSData Data Quality Foundation
 * 
 * Provenance contracts, metric classifications, quality dimensions,
 * and quarantine/replay contracts. API-independent — no TikTok-specific code.
 */

export {
  DataProvenance,
  WithProvenance,
  MetricClassification,
  createObservedProvenance,
  createCalculatedProvenance,
  createInferredProvenance,
  createUnavailableProvenance,
} from './provenance';
export * from './classification';
export * from './quality';
export * from './quarantine';
