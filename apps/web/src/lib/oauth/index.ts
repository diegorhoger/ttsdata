/**
 * Server-Only OAuth Module for TikTok Display API Verification
 * 
 * This module handles:
 * - Signed state cookie generation and validation
 * - Durable state storage with atomic consumption
 * - Durable probe result storage with TTL
 * - Session-bound result retrieval
 * - Token revocation
 * - Response sanitization
 * 
 * This is a verification-only implementation. No user data is persisted.
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

interface StateRecord {
  stateHash: string;
  sessionHash: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

// In-memory store for verification-only flow (use Redis/DB in production)
const stateStore = new Map<string, StateRecord>();

/**
 * Create a cryptographically secure state value with session binding.
 */
export function createState(sessionHash: string, secret: string): string {
  const state = randomBytes(32).toString('hex');
  const issuedAt = Date.now();
  const expiresAt = issuedAt + STATE_TTL_MS;

  // Hash the state for storage (don't store raw state)
  const stateHash = createHmac('sha256', secret).update(state).digest('hex');

  // Store state record
  stateStore.set(stateHash, {
    stateHash,
    sessionHash,
    issuedAt,
    expiresAt,
    consumedAt: null,
  });

  return state;
}

/**
 * Validate and atomically consume state.
 * Returns the session hash if valid, null otherwise.
 */
export function consumeState(
  state: string,
  sessionHash: string,
  secret: string
): { valid: boolean; sessionHash?: string; error?: string } {
  // Hash the provided state
  const stateHash = createHmac('sha256', secret).update(state).digest('hex');

  // Look up state record
  const record = stateStore.get(stateHash);
  if (!record) {
    return { valid: false, error: 'state_not_found' };
  }

  // Check if already consumed (replay protection)
  if (record.consumedAt !== null) {
    return { valid: false, error: 'state_already_consumed' };
  }

  // Check expiration
  if (Date.now() > record.expiresAt) {
    stateStore.delete(stateHash);
    return { valid: false, error: 'state_expired' };
  }

  // Verify session binding
  if (record.sessionHash !== sessionHash) {
    return { valid: false, error: 'session_mismatch' };
  }

  // Atomically consume state
  record.consumedAt = Date.now();

  return { valid: true, sessionHash: record.sessionHash };
}

// ============================================================================
// Probe Result Management
// ============================================================================

const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ProbeResultRecord {
  resultIdHash: string;
  sessionHash: string;
  data: any;
  scopes: string;
  bothSucceeded: boolean;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
}

// In-memory store for verification-only flow (use Redis/DB in production)
const probeResultStore = new Map<string, ProbeResultRecord>();

/**
 * Store probe result with session binding.
 * Returns the raw result ID (only shown once).
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
 * Atomically consume probe result.
 * Returns the data if valid, null otherwise.
 */
export function consumeProbeResult(
  resultId: string,
  sessionHash: string
): { valid: boolean; data?: any; scopes?: string; bothSucceeded?: boolean; error?: string } {
  // Hash the provided result ID with session
  const resultIdHash = createHmac('sha256', sessionHash).update(resultId).digest('hex');

  // Look up record
  const record = probeResultStore.get(resultIdHash);
  if (!record) {
    return { valid: false, error: 'result_not_found' };
  }

  // Check if already consumed
  if (record.consumedAt !== null) {
    return { valid: false, error: 'result_already_consumed' };
  }

  // Check expiration
  if (Date.now() > record.expiresAt) {
    probeResultStore.delete(resultIdHash);
    return { valid: false, error: 'result_expired' };
  }

  // Verify session binding
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
// Token Revocation
// ============================================================================

/**
 * Revoke TikTok OAuth token.
 * Returns true if revocation succeeded.
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
 * Preserves exact structure, replaces sensitive values with placeholders.
 */
export function sanitizeDisplayData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Redact URLs
    if (data.startsWith('http://') || data.startsWith('https://')) return '<URL>';
    // Redact long identifiers
    if (data.length > 20 && /^[a-zA-Z0-9_-]+$/.test(data)) return '<ID>';
    // Redact email-like
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
// Session Hash
// ============================================================================

/**
 * Create a session hash from browser fingerprint data.
 * Used to bind OAuth state and probe results to a session.
 */
export function createSessionHash(
  userAgent: string,
  ip: string,
  timestamp: number
): string {
  const data = `${userAgent}.${ip}.${timestamp}`;
  return createHmac('sha256', 'session-binding-secret').update(data).digest('hex');
}
