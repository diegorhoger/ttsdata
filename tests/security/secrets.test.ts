import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SecretError,
  getSecret,
  getSecretOrDefault,
  hasSecret,
  redactSecret,
} from '../../packages/security/src/secrets';

describe('Secrets', () => {
  const TEST_SECRET = 'TEST_SECRET_VALUE';

  beforeEach(() => {
    process.env.TEST_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    delete process.env.TEST_SECRET;
  });

  describe('getSecret', () => {
    it('returns secret when set', () => {
      expect(getSecret('TEST_SECRET')).toBe(TEST_SECRET);
    });

    it('throws when not set', () => {
      expect(() => getSecret('NONEXISTENT_SECRET')).toThrow(SecretError);
    });
  });

  describe('getSecretOrDefault', () => {
    it('returns secret when set', () => {
      expect(getSecretOrDefault('TEST_SECRET', 'default')).toBe(TEST_SECRET);
    });

    it('returns default when not set', () => {
      expect(getSecretOrDefault('NONEXISTENT_SECRET', 'default')).toBe('default');
    });
  });

  describe('hasSecret', () => {
    it('returns true when set', () => {
      expect(hasSecret('TEST_SECRET')).toBe(true);
    });

    it('returns false when not set', () => {
      expect(hasSecret('NONEXISTENT_SECRET')).toBe(false);
    });
  });

  describe('redactSecret', () => {
    it('shows only last 4 characters', () => {
      expect(redactSecret('abcdefgh')).toBe('****efgh');
    });

    it('handles short strings', () => {
      expect(redactSecret('abc')).toBe('****');
    });
  });
});
