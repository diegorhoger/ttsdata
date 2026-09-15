import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  validateUUID,
  validateEmail,
  validateString,
  validateNumber,
} from '../../packages/security/src/validation';

describe('Validation', () => {
  describe('validateUUID', () => {
    it('accepts valid UUID', () => {
      expect(() => validateUUID('550e8400-e29b-41d4-a716-446655440000', 'id')).not.toThrow();
    });

    it('rejects invalid UUID', () => {
      expect(() => validateUUID('not-a-uuid', 'id')).toThrow(ValidationError);
    });
  });

  describe('validateEmail', () => {
    it('accepts valid email', () => {
      expect(() => validateEmail('test@example.com', 'email')).not.toThrow();
    });

    it('rejects invalid email', () => {
      expect(() => validateEmail('not-an-email', 'email')).toThrow(ValidationError);
    });
  });

  describe('validateString', () => {
    it('accepts valid string', () => {
      expect(() => validateString('hello', 'name')).not.toThrow();
    });

    it('rejects non-string', () => {
      expect(() => validateString(123, 'name')).toThrow(ValidationError);
    });

    it('enforces minLength', () => {
      expect(() => validateString('hi', 'name', { minLength: 5 })).toThrow(ValidationError);
    });

    it('enforces maxLength', () => {
      expect(() => validateString('hello world', 'name', { maxLength: 5 })).toThrow(ValidationError);
    });

    it('enforces pattern', () => {
      expect(() => validateString('hello', 'name', { pattern: /^[0-9]+$/ })).toThrow(ValidationError);
    });
  });

  describe('validateNumber', () => {
    it('accepts valid number', () => {
      expect(() => validateNumber(42, 'count')).not.toThrow();
    });

    it('rejects non-number', () => {
      expect(() => validateNumber('42', 'count')).toThrow(ValidationError);
    });

    it('enforces integer', () => {
      expect(() => validateNumber(42.5, 'count', { integer: true })).toThrow(ValidationError);
    });

    it('enforces min', () => {
      expect(() => validateNumber(5, 'count', { min: 10 })).toThrow(ValidationError);
    });

    it('enforces max', () => {
      expect(() => validateNumber(15, 'count', { max: 10 })).toThrow(ValidationError);
    });
  });
});
