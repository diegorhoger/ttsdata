import { describe, it, expect } from 'vitest';
import {
  QuarantineRecord,
  QuarantineConfig,
  DEFAULT_QUARANTINE_CONFIG,
  quarantineRecord,
  canRetry,
  getRetryDelay,
  markForRetry,
  markResolved,
  markFailed,
  QuarantineError,
  replayRecord,
} from '../../packages/data-quality/src/quarantine';

describe('Quarantine', () => {
  describe('quarantineRecord', () => {
    it('creates record with default config', () => {
      const record = quarantineRecord('test-source', 'test-reason', { data: 'test' });
      expect(record.id).toBeDefined();
      expect(record.source).toBe('test-source');
      expect(record.reason).toBe('test-reason');
      expect(record.payload).toEqual({ data: 'test' });
      expect(record.retryCount).toBe(0);
      expect(record.maxRetries).toBe(3);
      expect(record.status).toBe('pending');
    });
  });

  describe('canRetry', () => {
    it('returns true for pending record', () => {
      const record = quarantineRecord('test', 'reason', {});
      expect(canRetry(record)).toBe(true);
    });

    it('returns false when max retries reached', () => {
      const record = quarantineRecord('test', 'reason', {});
      record.retryCount = 3;
      expect(canRetry(record)).toBe(false);
    });

    it('returns false when resolved', () => {
      const record = quarantineRecord('test', 'reason', {});
      record.status = 'resolved';
      expect(canRetry(record)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('returns base delay for first retry', () => {
      const record = quarantineRecord('test', 'reason', {});
      expect(getRetryDelay(record)).toBe(1000);
    });

    it('exponentially increases delay', () => {
      const record = quarantineRecord('test', 'reason', {});
      record.retryCount = 2;
      expect(getRetryDelay(record)).toBe(4000);
    });
  });

  describe('markForRetry', () => {
    it('increments retry count', () => {
      const record = quarantineRecord('test', 'reason', {});
      const retried = markForRetry(record);
      expect(retried.retryCount).toBe(1);
      expect(retried.status).toBe('retrying');
    });

    it('throws when max retries reached', () => {
      const record = quarantineRecord('test', 'reason', {});
      record.retryCount = 3;
      expect(() => markForRetry(record)).toThrow(QuarantineError);
    });
  });

  describe('markResolved', () => {
    it('marks record as resolved', () => {
      const record = quarantineRecord('test', 'reason', {});
      const resolved = markResolved(record);
      expect(resolved.status).toBe('resolved');
    });
  });

  describe('markFailed', () => {
    it('marks record as failed', () => {
      const record = quarantineRecord('test', 'reason', {});
      const failed = markFailed(record);
      expect(failed.status).toBe('failed');
    });
  });

  describe('replayRecord', () => {
    it('replays successfully', async () => {
      const record = quarantineRecord('test', 'reason', { data: 'test' });
      const result = await replayRecord(record, async (payload) => {
        return { success: true, payload };
      });
      expect(result.success).toBe(true);
      expect(record.status).toBe('resolved');
    });

    it('retries on failure', async () => {
      const record = quarantineRecord('test', 'reason', { data: 'test' });
      let attempts = 0;
      try {
        await replayRecord(record, async () => {
          attempts++;
          throw new Error('fail');
        });
      } catch (err) {
        // Expected
      }
      expect(attempts).toBe(1);
      expect(record.retryCount).toBe(1);
      expect(record.status).toBe('retrying');
    });
  });
});
