/**
 * Runtime configuration — fail-closed behaviour.
 *
 * These tests assert the production boot contract: missing, placeholder or
 * unsafe configuration must abort rather than silently falling back to a
 * development default. A known cookie secret or a localhost CORS origin must
 * never be reachable in production.
 */

import { describe, expect, it } from 'vitest';
import { loadRuntimeConfig, describeRuntimeConfig, RuntimeConfigError } from '../../apps/api/src/lib/runtime-config';

const BASE = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:secret@db.internal:5432/ttsdata',
  AUTH_SECRET: 'a'.repeat(48),
  ALLOWED_ORIGINS: 'https://ttsdata.netlify.app',
} as unknown as NodeJS.ProcessEnv;

describe('runtime config — production fail-closed', () => {
  it('loads a valid production configuration', () => {
    const config = loadRuntimeConfig(BASE);
    expect(config.environment).toBe('production');
    expect(config.port).toBe(4000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.allowedOrigins).toEqual(['https://ttsdata.netlify.app']);
  });

  it('requires DATABASE_URL', () => {
    const env = { ...BASE } as Record<string, string>;
    delete env.DATABASE_URL;
    expect(() => loadRuntimeConfig(env as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL is required/);
  });

  it('requires AUTH_SECRET', () => {
    const env = { ...BASE } as Record<string, string>;
    delete env.AUTH_SECRET;
    expect(() => loadRuntimeConfig(env as NodeJS.ProcessEnv)).toThrow(/AUTH_SECRET is required/);
  });

  it('rejects the legacy development fallback secret', () => {
    // The previous code defaulted to this exact string in production.
    expect(() => loadRuntimeConfig({ ...BASE, AUTH_SECRET: 'dev-secret-change-in-production' } as NodeJS.ProcessEnv))
      .toThrow(/placeholder/);
  });

  it('rejects a short AUTH_SECRET', () => {
    expect(() => loadRuntimeConfig({ ...BASE, AUTH_SECRET: 'short-secret' } as NodeJS.ProcessEnv))
      .toThrow(/at least 32 characters/);
  });

  it('rejects a non-PostgreSQL DATABASE_URL', () => {
    expect(() => loadRuntimeConfig({ ...BASE, DATABASE_URL: 'mysql://x/y' } as NodeJS.ProcessEnv))
      .toThrow(/PostgreSQL connection string/);
  });

  it('rejects a localhost database in production', () => {
    expect(() => loadRuntimeConfig({ ...BASE, DATABASE_URL: 'postgresql://u:p@localhost:5432/d' } as NodeJS.ProcessEnv))
      .toThrow(/must not point at localhost/);
  });

  it('permits a localhost database only behind the explicit smoke-test override', () => {
    const config = loadRuntimeConfig({
      ...BASE, DATABASE_URL: 'postgresql://u:p@localhost:5432/d', ALLOW_LOCALHOST_DATABASE: 'true',
    } as NodeJS.ProcessEnv);
    expect(config.databaseUrl).toContain('localhost');
  });

  it('requires ALLOWED_ORIGINS in production', () => {
    const env = { ...BASE } as Record<string, string>;
    delete env.ALLOWED_ORIGINS;
    expect(() => loadRuntimeConfig(env as NodeJS.ProcessEnv)).toThrow(/ALLOWED_ORIGINS is required/);
  });

  it('rejects a wildcard origin', () => {
    expect(() => loadRuntimeConfig({ ...BASE, ALLOWED_ORIGINS: '*' } as NodeJS.ProcessEnv))
      .toThrow(/wildcard/);
  });

  it('rejects a non-https origin', () => {
    expect(() => loadRuntimeConfig({ ...BASE, ALLOWED_ORIGINS: 'http://ttsdata.netlify.app' } as NodeJS.ProcessEnv))
      .toThrow(/https/);
  });

  it('rejects a localhost origin', () => {
    expect(() => loadRuntimeConfig({ ...BASE, ALLOWED_ORIGINS: 'https://localhost:3000' } as NodeJS.ProcessEnv))
      .toThrow(/localhost/);
  });

  it('rejects a relative origin', () => {
    expect(() => loadRuntimeConfig({ ...BASE, ALLOWED_ORIGINS: '/callback' } as NodeJS.ProcessEnv))
      .toThrow(/absolute URL/);
  });

  it('accepts multiple explicit origins', () => {
    const config = loadRuntimeConfig({
      ...BASE, ALLOWED_ORIGINS: 'https://ttsdata.netlify.app,https://app.ttsdata.com',
    } as NodeJS.ProcessEnv);
    expect(config.allowedOrigins).toHaveLength(2);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadRuntimeConfig({ ...BASE, PORT: '99999' } as NodeJS.ProcessEnv))
      .toThrow(/PORT must be an integer/);
  });

  it('rejects a non-https API_ORIGIN in production', () => {
    expect(() => loadRuntimeConfig({ ...BASE, API_ORIGIN: 'http://api.ttsdata.com' } as NodeJS.ProcessEnv))
      .toThrow(/API_ORIGIN must use https/);
  });

  it('allows development defaults only outside production', () => {
    const config = loadRuntimeConfig({
      NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/d', AUTH_SECRET: 'dev',
    } as unknown as NodeJS.ProcessEnv);
    expect(config.allowedOrigins).toEqual(['http://localhost:3000']);
  });
});

describe('runtime config — startup summary', () => {
  it('never includes a secret value', () => {
    const config = loadRuntimeConfig(BASE);
    const summary = describeRuntimeConfig(config);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('a'.repeat(48));
    // The database *password* must never appear. The username is not a secret
    // and is legitimately visible in a connection string.
    expect(serialized).not.toContain('secret@');
    // Password is replaced, secret is reported as a length only.
    expect(String(summary.database)).toContain('***');
    expect(String(summary.authSecret)).toMatch(/^len=\d+$/);
  });
});

describe('runtime config — error type', () => {
  it('throws a typed error so callers can distinguish config failure', () => {
    try {
      loadRuntimeConfig({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigError);
    }
  });
});
