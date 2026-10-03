/**
 * Issue #20 configuration — fail-closed validation for the Display OAuth surface.
 *
 * Every value is required and validated before use. A missing or malformed value
 * aborts the request rather than falling back to a default, and the canonical
 * origin is enforced so a redirect URI cannot point outside the deployment.
 */

import { assertDisplayEndpointAllowed } from './capability';

export interface DisplayConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  sessionSecret: string;
  resultSecret: string;
  canonicalOrigin: string;
}

export class DisplayConfigError extends Error {
  constructor(message: string) { super(message); this.name = 'DisplayConfigError'; }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') throw new DisplayConfigError(`${name} is required`);
  return value.trim();
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new DisplayConfigError('Redirect URI must be an absolute URL');
  }
}

export function loadDisplayConfig(env: NodeJS.ProcessEnv = process.env): DisplayConfig {
  const clientKey = required(env, 'TIKTOK_CLIENT_KEY');
  const clientSecret = required(env, 'TIKTOK_CLIENT_SECRET');
  const redirectUri = required(env, 'NEXT_PUBLIC_TIKTOK_REDIRECT_URI');
  const stateSecret = required(env, 'OAUTH_STATE_SECRET');
  const sessionSecret = required(env, 'OAUTH_SESSION_SECRET');
  const resultSecret = env.OAUTH_RESULT_SECRET?.trim() || sessionSecret;
  const canonicalOrigin = required(env, 'OAUTH_CANONICAL_ORIGIN');

  if (stateSecret.length < 32) throw new DisplayConfigError('OAUTH_STATE_SECRET must be at least 32 characters');
  if (sessionSecret.length < 32) throw new DisplayConfigError('OAUTH_SESSION_SECRET must be at least 32 characters');
  if (resultSecret.length < 32) throw new DisplayConfigError('OAUTH_RESULT_SECRET must be at least 32 characters');

  const redirectOrigin = originOf(redirectUri);
  const expectedOrigin = originOf(canonicalOrigin);
  if (redirectOrigin !== expectedOrigin) {
    throw new DisplayConfigError('Redirect URI must share the canonical origin');
  }
  if (redirectUri.includes('tiktokglobalshop.com') || redirectUri.includes('tiktok-shops.com')) {
    throw new DisplayConfigError('Redirect URI must not target the Shop API family');
  }
  // The token/authorize endpoints are the only permitted provider hosts.
  assertDisplayEndpointAllowed('https://open.tiktokapis.com/v2/oauth/token/');
  assertDisplayEndpointAllowed('https://www.tiktok.com/v2/auth/authorize/');

  return { clientKey, clientSecret, redirectUri, stateSecret, sessionSecret, resultSecret, canonicalOrigin: expectedOrigin };
}
