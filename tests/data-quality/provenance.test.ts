import { describe, it, expect } from 'vitest';
import {
  DataProvenance,
  MetricClassification,
  createObservedProvenance,
  createCalculatedProvenance,
  createInferredProvenance,
  createUnavailableProvenance,
} from '../../packages/data-quality/src/provenance';

describe('Provenance', () => {
  describe('createObservedProvenance', () => {
    it('creates observed provenance with correct classification', () => {
      const p = createObservedProvenance(
        'tiktok_shop_api:v202309',
        '/product/202309/products/123',
        'BR',
        'seller.product.basic'
      );
      expect(p.source).toBe('tiktok_shop_api:v202309');
      expect(p.endpoint).toBe('/product/202309/products/123');
      expect(p.marketplace).toBe('BR');
      expect(p.scopeContext).toBe('seller.product.basic');
      expect(p.metricClassification).toBe('observed');
      expect(p.retrievedAt).toBeDefined();
    });
  });

  describe('createCalculatedProvenance', () => {
    it('creates calculated provenance', () => {
      const p = createCalculatedProvenance(
        'tiktok_shop_api:v202309',
        '/products/123/analytics',
        'BR',
        'seller.product.basic',
        'raw-payload-ref-123'
      );
      expect(p.metricClassification).toBe('calculated');
      expect(p.rawPayloadRef).toBe('raw-payload-ref-123');
    });
  });

  describe('createInferredProvenance', () => {
    it('creates inferred provenance', () => {
      const p = createInferredProvenance(
        'model:v1',
        '/products/123/predict',
        'BR',
        'seller.product.basic'
      );
      expect(p.metricClassification).toBe('inferred');
    });
  });

  describe('createUnavailableProvenance', () => {
    it('creates unavailable provenance', () => {
      const p = createUnavailableProvenance(
        'tiktok_shop_api:v202309',
        '/products/123/demographics',
        'BR',
        'seller.product.basic'
      );
      expect(p.metricClassification).toBe('unavailable');
    });
  });
});
