/**
 * Secret management.
 * 
 * Secrets are never stored in code, logs, or error messages.
 * All secret access goes through this module.
 */

export class SecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretError';
  }
}

/**
 * Get a secret from environment variables.
 * Throws if not set. Never logs the value.
 */
export function getSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new SecretError(`Secret ${name} is not set`);
  }
  return value;
}

/**
 * Get a secret with a default value (for non-critical secrets only).
 */
export function getSecretOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Check if a secret is set without exposing its value.
 */
export function hasSecret(name: string): boolean {
  return !!process.env[name];
}

/**
 * Redact a string, showing only the last 4 characters.
 */
export function redactSecret(value: string): string {
  if (value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}
