/**
 * Server-Only OAuth Module for TikTok Display API Verification
 * 
 * This module handles:
 * - State registration and consumption (with session binding)
 * - Probe result storage with TTL
 * - Session binding via signed cookies
 * - Token revocation
 * - Response sanitization
 * 
 * State and probe records are stored in-memory with TTL.
 * For production: replace with PostgreSQL/Redis.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

export interface OAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
}

export function getOAuthConfig(): OAuthConfig {
  const clientKey = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;

  if (!clientKey) throw new Error('NEXT_PUBLIC_TIKTOK_CLIENT_KEY is not configured');
  if (!clientSecret) throw new Error('TIKTOK_CLIENT_SECRET is not configured');
  if (!redirectUri) throw new Error('NEXT_PUBLIC_TIKTOK_REDIRECT_URI is not configured');
  if (!stateSecret) throw new Error('OAUTH_STATE_SECRET is not configured');

  return { clientKey, clientSecret, redirectUri, stateSecret };
}

// ============================================================================
// State Management
// ============================================================================

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface StateRecord {
  rawState: string;
  stateHash: string;
  sessionHash: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

// In-memory state store (use PostgreSQL/Redis in production)
const stateStore = new Map<string, StateRecord>();

/**
 * Create a cryptographically secure state value.
 * Registers the state in the store and returns the raw state value.
 */
export function createState(sessionHash: string, secret: string): string {
  const rawState = randomBytes(32).toString('hex');
  const issuedAt = Date.now();
  const expiresAt = issuedAt + STATE_TTL_MS;
  const stateHash = createHmac('sha256', secret).update(rawState).digest('hex');

  stateStore.set(stateHash, {
    rawState,
    stateHash,
    sessionHash,
    issuedAt,
    expiresAt,
    consumedAt: null,
  });

  return rawState;
}

/**
 * Consume state atomically.
 * Returns { valid, sessionHash, error } tuple.
 */
export function consumeState(
  rawState: string,
  sessionHash: string,
  secret: string
): { valid: boolean; sessionHash?: string; error?: string } {
  const stateHash = createHmac('sha256', secret).update(rawState).digest('hex');

  const record = stateStore.get(stateHash);
  if (!record) {
    return { valid: false, error: 'state_not_found' };
  }

  if (record.consumedAt !== null) {
    return { valid: false, error: 'state_already_consumed' };
  }

  if (Date.now() > record.expiresAt) {
    stateStore.delete(stateHash);
    return { valid: false, error: 'state_expired' };
  }

  if (record.sessionHash !== sessionHash) {
    return { valid: false, error: 'session_mismatch' };
  }

  // Atomically consume
  record.consumedAt = Date.now();

  return { valid: true, sessionHash: record.sessionHash };
}

// ============================================================================
// Session Management
// ============================================================================

const SESSION_COOKIE_NAME = 'ttsdata_session';
const SESSION_TTL_SECONDS = 3600; // 1 hour

interface SessionRecord {
  sessionHash: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory session store
const sessionStore = new Map<string, SessionRecord>();

/**
 * Create a session record and return the session hash.
 */
export function createSession(sessionHash: string): string {
  const now = Date.now();
  sessionStore.set(sessionHash, {
    sessionHash,
    createdAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  });
  return sessionHash;
}

/**
 * Verify and retrieve session.
 */
export function getSession(sessionHash: string): SessionRecord | null {
  const record = sessionStore.get(sessionHash);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    sessionStore.delete(sessionHash);
    return null;
  }
  return record;
}

// ============================================================================
// Probe Result Management
// ============================================================================

const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ProbeResultRecord {
  resultId: string;
  resultIdHash: string;
  sessionHash: string;
  data: any;
  scopes: string;
  bothSucceeded: boolean;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

// In-memory probe result store
const probeResultStore = new Map<string, ProbeResultRecord>();

/**
 * Store probe result with session binding.
 * Returns the raw result ID.
 */
export function storeProbeResult(
  sessionHash: string,
  data: any,
  scopes: string,
  bothSucceeded: boolean
): string {
  const resultId = randomBytes(16).toString('hex');
  const resultIdHash = createHmac('sha256', sessionHash).update(resultId).digest('hex');
  const now = Date.now();

  probeResultStore.set(resultIdHash, {
    resultId,
    resultIdHash,
    sessionHash,
    data,
    scopes,
    bothSucceeded,
    createdAt: now,
    expiresAt: now + PROBE_TTL_MS,
    consumedAt: null,
  });

  return resultId;
}

/**
 * Consume probe result atomically.
 * Returns the data if valid.
 */
export function consumeProbeResult(
  resultId: string,
  sessionHash: string
): { valid: boolean; data?: any; scopes?: string; bothSucceeded?: boolean; error?: string } {
  const resultIdHash = createHmac('sha256', sessionHash).update(resultId).digest('hex');

  const record = probeResultStore.get(resultIdHash);
  if (!record) {
    return { valid: false, error: 'result_not_found' };
  }

  if (record.consumedAt !== null) {
    return { valid: false, error: 'result_already_consumed' };
  }

  if (Date.now() > record.expiresAt) {
    probeResultStore.delete(resultIdHash);
    return { valid: false, error: 'result_expired' };
  }

  if (record.sessionHash !== sessionHash) {
    return { valid: false, error: 'session_mismatch' };
  }

  // Atomically consume
  record.consumedAt = Date.now();

  return {
    valid: true,
    data: record.data,
    scopes: record.scopes,
    bothSucceeded: record.bothSucceeded,
  };
}

// ============================================================================
// Cookie Utilities
// ============================================================================

const COOKIE_STATE_NAME = 'ttsdata_oauth_state';
const COOKIE_SESSION_NAME = 'ttsdata_session';
const STATE_COOKIE_TTL_SECONDS = 600; // 10 min
const SESSION_COOKIE_TTL_SECONDS = 3600; // 1 hour

/**
 * Create signed state cookie value.
 */
export function createStateCookieValue(
  rawState: string,
  sessionHash: string,
  secret: string
): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', secret)
    .update(`${rawState}.${sessionHash}.${issuedAt}`)
    .digest('hex');
  return `${rawState}.${sessionHash}.${issuedAt}.${hmac}`;
}

/**
 * Verify and decode state cookie.
 * Returns the raw state and session hash if valid.
 */
export function verifyStateCookie(
  cookieValue: string,
  secret: string
): { rawState: string; sessionHash: string } | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 4) return null;

  const [rawState, sessionHash, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);

  if (isNaN(issuedAt)) return null;

  // Check expiration
  if (Date.now() - issuedAt > STATE_COOKIE_TTL_SECONDS * 1000) {
    return null;
  }

  // Verify HMAC
  const expectedHmac = createHmac('sha256', secret)
    .update(`${rawState}.${sessionHash}.${issuedAt}`)
    .digest('hex');

  const hmacBuffer = Buffer.from(hmac, 'hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');

  if (hmacBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(hmacBuffer, expectedBuffer)) return null;

  return { rawState, sessionHash };
}

/**
 * Create session cookie value.
 */
export function createSessionCookieValue(sessionHash: string, secret: string): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', secret)
    .update(`${sessionHash}.${issuedAt}`)
    .digest('hex');
  return `${sessionHash}.${issuedAt}.${hmac}`;
}

/**
 * Verify and decode session cookie.
 */
export function verifySessionCookie(
  cookieValue: string,
  secret: string
): { sessionHash: string } | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;

  const [sessionHash, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);

  if (isNaN(issuedAt)) return null;

  // Check expiration
  if (Date.now() - issuedAt > SESSION_COOKIE_TTL_SECONDS * 1000) {
    return null;
  }

  // Verify HMAC
  const expectedHmac = createHmac('sha256', secret)
    .update(`${sessionHash}.${issuedAt}`)
    .digest('hex');

  const hmacBuffer = Buffer.from(hmac, 'hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');

  if (hmacBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(hmacBuffer, expectedBuffer)) return null;

  return { sessionHash };
}

// ============================================================================
// Token Revocation
// ============================================================================

/**
 * Revoke TikTok OAuth token.
 */
export async function revokeToken(
  accessToken: string,
  clientKey: string,
  clientSecret: string
): Promise<boolean> {
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        token: accessToken,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Sanitization
// ============================================================================

const SENSITIVE_FIELDS = new Set([
  'open_id',
  'union_id',
  'display_name',
  'avatar_url',
  'cover_image_url',
  'username',
  'nickname',
  'log_id',
  'email',
  'phone',
  'access_token',
  'refresh_token',
]);

/**
 * Recursively sanitize display data.
 */
export function sanitizeDisplayData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) return '<URL>';
    if (data.length > 20 && /^[a-zA-Z0-9_-]+$/.test(data)) return '<ID>';
    if (data.includes('@') && data.includes('.')) return '<EMAIL>';
    return data;
  }
  if (typeof data === 'number') return data;
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data.map(sanitizeDisplayData);
  if (typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_FIELDS.has(key)) {
        result[key] = '<REDACTED>';
      } else {
        result[key] = sanitizeDisplayData(value);
      }
    }
    return result;
  }
  return data;
}

// ============================================================================
// Environment Validation
// ============================================================================

/**
 * Validate all required environment variables are set.
 * Throws if any are missing.
 */
export function validateEnvironment(): void {
  const required = [
    'NEXT_PUBLIC_TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'NEXT_PUBLIC_TIKTOK_REDIRECT_URI',
    'OAUTH_STATE_SECRET',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is not configured`);
    }
  }
}
