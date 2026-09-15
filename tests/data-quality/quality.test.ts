import { describe, it, expect } from 'vitest';
import {
  QualityConfig,
  DEFAULT_QUALITY_CONFIG,
  calculateFreshness,
  calculateCompleteness,
  calculateAccuracy,
  generateQualityReport,
  isQualitySufficientForRanking,
} from '../../packages/data-quality/src/quality';

describe('Quality', () => {
  describe('calculateFreshness', () => {
    it('passes for recent data', () => {
      const dim = calculateFreshness(new Date());
      expect(dim.status).toBe('pass');
      expect(dim.currentValue).toBeLessThan(1);
    });

    it('fails for stale data', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const dim = calculateFreshness(oldDate);
      expect(dim.status).toBe('fail');
    });

    it('warns for aging data', () => {
      const agingDate = new Date(Date.now() - 30 * 60 * 60 * 1000);
      const dim = calculateFreshness(agingDate);
      expect(dim.status).toBe('warn');
    });
  });

  describe('calculateCompleteness', () => {
    it('passes when all fields present', () => {
      const dim = calculateCompleteness(10, 10);
      expect(dim.status).toBe('pass');
      expect(dim.currentValue).toBe(1);
    });

    it('fails when too many fields missing', () => {
      const dim = calculateCompleteness(5, 10);
      expect(dim.status).toBe('fail');
    });
  });

  describe('calculateAccuracy', () => {
    it('passes when all data validated', () => {
      const dim = calculateAccuracy(100, 100);
      expect(dim.status).toBe('pass');
    });

    it('fails when too much data invalid', () => {
      const dim = calculateAccuracy(50, 100);
      expect(dim.status).toBe('fail');
    });
  });

  describe('generateQualityReport', () => {
    it('generates passing report for good data', () => {
      // explicit config: maxAgeHours=9999 effectively disables the freshness gate
      const report = generateQualityReport(
        'product', '123',
        new Date('2026-09-14T18:00:00.000Z'),
        10, 10, 100,
        { maxAgeHours: 9999, minCompleteness: 0.8, minAccuracy: 0.9 }
      );
      expect(report.overallStatus).toBe('pass');
      expect(report.dimensions).toHaveLength(3);
    });

    it('generates failing report for bad data', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const report = generateQualityReport(
        'product', '123',
        oldDate,
        5, 10, 50, 100
      );
      expect(report.overallStatus).toBe('fail');
    });
  });

  describe('isQualitySufficientForRanking', () => {
    it('returns true for passing quality', () => {
      const recentDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const report = generateQualityReport(
        'product', '123',
        recentDate, 10, 10, 10
      );
      expect(report.overallStatus).toBe('pass');
      expect(isQualitySufficientForRanking(report)).toBe(true);
    });

    it('returns false for failing quality', () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      const report = generateQualityReport(
        'product', '123',
        oldDate, 5, 10, 5
      );
      expect(report.overallStatus).toBe('fail');
      expect(isQualitySufficientForRanking(report)).toBe(false);
    });
  });
});
