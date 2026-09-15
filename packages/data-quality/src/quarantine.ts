/**
 * Malformed input quarantine and replay contracts.
 * 
 * These contracts are API-independent — they don't assume any specific
 * payload shape. They define the interface for quarantining bad data
 * and replaying failed operations.
 */

export interface QuarantineRecord<T = unknown> {
  id: string;
  timestamp: string;
  source: string;
  reason: string;
  payload: T;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'retrying' | 'failed' | 'resolved';
}

export interface QuarantineConfig {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_QUARANTINE_CONFIG: QuarantineConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  backoffMultiplier: 2,
};

export class QuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuarantineError';
  }
}

/**
 * Add a record to quarantine.
 */
export function quarantineRecord<T>(
  source: string,
  reason: string,
  payload: T,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): QuarantineRecord<T> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    source,
    reason,
    payload,
    retryCount: 0,
    maxRetries: config.maxRetries,
    status: 'pending',
  };
}

/**
 * Check if a record can be retried.
 */
export function canRetry(record: QuarantineRecord): boolean {
  return record.retryCount < record.maxRetries && record.status !== 'resolved';
}

/**
 * Calculate next retry delay with exponential backoff.
 */
export function getRetryDelay(
  record: QuarantineRecord,
  config: QuarantineConfig = DEFAULT_QUARANTINE_CONFIG
): number {
  return config.retryDelayMs * Math.pow(config.backoffMultiplier, record.retryCount);
}

/**
 * Mark a record for retry.
 */
export function markForRetry(record: QuarantineRecord): QuarantineRecord {
  if (!canRetry(record)) {
    throw new QuarantineError(`Record ${record.id} cannot be retried`);
  }
  return {
    ...record,
    retryCount: record.retryCount + 1,
    status: 'retrying',
  };
}

/**
 * Mark a record as resolved.
 */
export function markResolved(record: QuarantineRecord): QuarantineRecord {
  return {
    ...record,
    status: 'resolved',
  };
}

/**
 * Mark a record as permanently failed.
 */
export function markFailed(record: QuarantineRecord): QuarantineRecord {
  return {
    ...record,
    status: 'failed',
  };
}

/**
 * Replay a quarantined record.
 * 
 * This is a generic interface — the actual replay logic depends on
 * the data source and must be implemented by the caller.
 * 
 * Mutates the record in place to update its status.
 */
export async function replayRecord<T, R>(
  record: QuarantineRecord<T>,
  replayFn: (payload: T) => Promise<R>
): Promise<R> {
  if (!canRetry(record)) {
    throw new QuarantineError(`Record ${record.id} cannot be replayed`);
  }
  try {
    const result = await replayFn(record.payload);
    record.status = 'resolved';
    return result;
  } catch (err) {
    record.retryCount += 1;
    record.status = 'retrying';
    throw err;
  }
}
