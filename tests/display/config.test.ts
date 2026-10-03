import { describe, expect, it } from 'vitest';
import { loadDisplayConfig } from '../../packages/db/src/display/config';

const base = {
  TIKTOK_CLIENT_KEY: 'ck', TIKTOK_CLIENT_SECRET: 'cs',
  NEXT_PUBLIC_TIKTOK_REDIRECT_URI: 'https://ttsdata.netlify.app/api/auth/tiktok/callback',
  OAUTH_STATE_SECRET: 's'.repeat(32), OAUTH_SESSION_SECRET: 't'.repeat(32),
  OAUTH_CANONICAL_ORIGIN: 'https://ttsdata.netlify.app',
};

describe('Display configuration validation', () => {
  it('loads a valid configuration', () => {
    const config = loadDisplayConfig(base as NodeJS.ProcessEnv);
    expect(config.canonicalOrigin).toBe('https://ttsdata.netlify.app');
    expect(config.resultSecret).toBe(base.OAUTH_SESSION_SECRET);
  });

  it('fails closed when any required value is missing', () => {
    for (const key of Object.keys(base)) {
      const env = { ...base } as Record<string, string>;
      delete env[key];
      expect(() => loadDisplayConfig(env as NodeJS.ProcessEnv)).toThrow(/is required/);
    }
  });

  it('rejects a short state or session secret', () => {
    expect(() => loadDisplayConfig({ ...base, OAUTH_STATE_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(/at least 32/);
    expect(() => loadDisplayConfig({ ...base, OAUTH_SESSION_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(/at least 32/);
  });

  it('rejects a redirect URI outside the canonical origin', () => {
    expect(() => loadDisplayConfig({
      ...base, NEXT_PUBLIC_TIKTOK_REDIRECT_URI: 'https://attacker.example.com/callback',
    } as NodeJS.ProcessEnv)).toThrow(/canonical origin/);
  });

  it('rejects a redirect URI targeting the Shop API family', () => {
    expect(() => loadDisplayConfig({
      ...base, NEXT_PUBLIC_TIKTOK_REDIRECT_URI: 'https://ttsdata.netlify.app/x?next=tiktokglobalshop.com',
    } as NodeJS.ProcessEnv)).toThrow(/Shop API family/);
  });

  it('rejects a relative redirect URI', () => {
    expect(() => loadDisplayConfig({
      ...base, NEXT_PUBLIC_TIKTOK_REDIRECT_URI: '/callback',
    } as NodeJS.ProcessEnv)).toThrow(/absolute URL/);
  });

  it('requires a distinct result secret when one is supplied', () => {
    expect(() => loadDisplayConfig({
      ...base, OAUTH_RESULT_SECRET: 'short',
    } as NodeJS.ProcessEnv)).toThrow(/OAUTH_RESULT_SECRET/);
  });
});
