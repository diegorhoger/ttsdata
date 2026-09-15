/**
 * Input validation helpers.
 * 
 * All external input must be validated before processing.
 * These helpers are API-agnostic and can be used with any data source.
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateUUID(value: string, field: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(value)) {
    throw new ValidationError(`${field} must be a valid UUID`);
  }
}

export function validateEmail(value: string, field: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    throw new ValidationError(`${field} must be a valid email`);
  }
}

export function validateString(
  value: unknown,
  field: string,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new ValidationError(`${field} must be at least ${options.minLength} characters`);
  }
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(`${field} must be at most ${options.maxLength} characters`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new ValidationError(`${field} does not match required pattern`);
  }
  return value;
}

export function validateNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${field} must be a number`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`${field} must be at least ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`${field} must be at most ${options.max}`);
  }
  return value;
}
