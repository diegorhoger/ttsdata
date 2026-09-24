/**
 * OAuth Module — Server-side OAuth flow helpers for TikTok Display API
 * 
 * Provides helper functions for OAuth routes.
 * All DB operations go through OAuthRepository.
 * IMPORTANT: Uses project's existing DB connection pattern.
 */

import { OAuthRepository } from '@ttsdata/db';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const SESSION_COOKIE_NAME = 'ttsdata_session';
const STATE_COOKIE_TTL_SECONDS = 600;
const SESSION_COOKIE_TTL_SECONDS = 3600;
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';
const PROBE_COOKIE_TTL_SECONDS = 300;

function getConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || '';
  const stateSecret = process.env.OAUTH_STATE_SECRET || '';
  const sessionSecret = process.env.OAUTH_SESSION_SECRET || '';

  if (!clientKey) throw new Error('TIKTOK_CLIENT_KEY is not configured');
  if (!clientSecret) throw new Error('TIKTOK_CLIENT_SECRET is not configured');
  if (!redirectUri) throw new Error('NEXT_PUBLIC_TIKTOK_REDIRECT_URI is not configured');
  if (!stateSecret) throw new Error('OAUTH_STATE_SECRET is not configured');
  if (!sessionSecret) throw new Error('OAUTH_SESSION_SECRET is not configured');

  return { clientKey, clientSecret, redirectUri, stateSecret, sessionSecret };
}

// Use project's existing DB connection pattern - get Pool from environment
function getOAuthRepository(): OAuthRepository {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/ttsdata';
  return new OAuthRepository(databaseUrl, getConfig());
}

/**
 * Create session cookies.
 * Uses rawState for BOTH the state cookie (for verification) and derives sessionId from it.
 * This ensures the callback can compare stateParam (from TikTok) with the cookie's rawState.
 */
export function createSessionCookies(rawState: string): {
  sessionId: string;
  stateCookieValue: string;
  sessionCookieValue: string;
} {
  const config = getConfig();
  
  // Derive sessionId from rawState using HMAC
  const sessionId = createHmac('sha256', config.sessionSecret)
    .update(rawState)
    .digest('hex');

  // State cookie contains rawState (for callback to compare with stateParam)
  const stateCookieValue = createStateCookieValue(rawState, config.stateSecret);
  
  // Session cookie contains sessionId (for probe result binding)
  const sessionCookieValue = createSessionCookieValue(sessionId, config.sessionSecret);

  return { sessionId, stateCookieValue, sessionCookieValue };
}

function createStateCookieValue(rawState: string, stateSecret: string): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', stateSecret)
    .update(rawState + '.' + issuedAt)
    .digest('hex');
  return `${rawState}.${issuedAt}.${hmac}`;
}

function createSessionCookieValue(sessionId: string, sessionSecret: string): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', sessionSecret)
    .update(sessionId + '.' + issuedAt)
    .digest('hex');
  return `${sessionId}.${issuedAt}.${hmac}`;
}

/**
 * Verify state cookie and extract rawState.
 * The state cookie contains rawState.issuedAt.hmac
 * We verify the HMAC and return rawState for comparison with stateParam.
 */
export function verifyStateCookie(cookieValue: string): { rawState: string } | null {
  if (!cookieValue) return null;
  
  const config = getConfig();
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  
  const [rawState, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);
  
  if (isNaN(issuedAt)) return null;
  if (Date.now() - issuedAt > STATE_COOKIE_TTL_SECONDS * 1000) return null;
  
  const data = rawState + '.' + issuedAt;
  const expectedHmac = createHmac('sha256', config.stateSecret)
    .update(data)
    .digest('hex');
  
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (hmacBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;
  
  return { rawState };
}

/**
 * Verify session cookie and extract sessionId.
 * The session cookie contains sessionId.issuedAt.hmac
 */
export function verifySessionCookie(cookieValue: string): { sessionId: string } | null {
  if (!cookieValue) return null;
  
  const config = getConfig();
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  
  const [sessionId, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);
  
  if (isNaN(issuedAt)) return null;
  if (Date.now() - issuedAt > SESSION_COOKIE_TTL_SECONDS * 1000) return null;
  
  const data = sessionId + '.' + issuedAt;
  const expectedHmac = createHmac('sha256', config.sessionSecret)
    .update(data)
    .digest('hex');
  
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (hmacBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;
  
  return { sessionId };
}

/**
 * Create probe result cookie.
 * Contains: resultId.sessionId.issuedAt.hmac (all serialized)
 */
export function createProbeResultCookie(rawState: string, sessionId: string): string {
  const config = getConfig();
  const issuedAt = Date.now();
  const serialized = `${rawState}.${sessionId}.${issuedAt}`;
  const hmac = createHmac('sha256', config.sessionSecret)
    .update(serialized)
    .digest('hex');
  return `${serialized}.${hmac}`;
}

/**
 * Verify and decode probe result cookie.
 * Returns rawState (for reference) and sessionId.
 */
export function verifyProbeResultCookie(cookieValue: string): { rawState: string; sessionId: string } | null {
  if (!cookieValue) return null;
  
  const config = getConfig();
  const parts = cookieValue.split('.');
  if (parts.length !== 4) return null;
  
  const [rawState, sessionId, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);
  
  if (isNaN(issuedAt)) return null;
  
  const data = rawState + '.' + sessionId + '.' + issuedAt;
  const expectedHmac = createHmac('sha256', config.sessionSecret)
    .update(data)
    .digest('hex');
  
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (hmacBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;
  
  return { rawState, sessionId };
}

// ============================================================================
// OAuth Flow Helpers
// ============================================================================

/**
 * Create OAuth state and redirect to TikTok.
 * Returns the auth URL and a response with cookies set.
 * IMPORTANT: Caller MUST use the returned response (or copy its cookies)
 * for the redirect, otherwise cookies are lost.
 */
export async function createOAuthStateWithCookies(request: NextRequest): Promise<{
  authUrl: string;
  response: NextResponse;
}> {
  const config = getConfig();
  const repository = getOAuthRepository();
  
  // Generate rawState - this is what TikTok receives as state param
  // AND what goes in the state cookie for verification
  const rawState = randomBytes(32).toString('hex');
  
  // Derive sessionId from rawState for probe result binding
  const sessionId = createHmac('sha256', config.sessionSecret)
    .update(rawState)
    .digest('hex');
  
  // Store in DB - uses sessionHash derived from rawState (not rawState itself)
  const sessionHash = createHmac('sha256', config.sessionSecret)
    .update(rawState)
    .digest('hex');
  
  const expiresAt = new Date(Date.now() + STATE_COOKIE_TTL_SECONDS * 1000);
  await repository.createState({
    sessionHash,
    expiresAt,
  });

  // Create cookies
  const stateCookieValue = createStateCookieValue(rawState, config.stateSecret);
  const sessionCookieValue = createSessionCookieValue(sessionId, config.sessionSecret);
  
  // Generate the TikTok authorization URL
  const clientKey = config.clientKey;
  const redirectUri = config.redirectUri;
  
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', clientKey);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
  authUrl.searchParams.set('state', rawState);

  // Create response with cookies set
  const response = new NextResponse(null);
  response.cookies.set(STATE_COOKIE_NAME, stateCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_COOKIE_TTL_SECONDS,
    path: '/',
  });
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_TTL_SECONDS,
    path: '/',
  });

  return { authUrl: authUrl.toString(), response };
}

/**
 * Consume OAuth state from DB.
 */
export async function consumeOAuthState(rawState: string, sessionHash: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const repository = getOAuthRepository();
  const result = await repository.consumeState(rawState, sessionHash);
  return { success: result.success, error: result.error };
}

/**
 * Store probe result in DB and return result ID.
 */
export async function storeProbeResult(
  rawState: string,
  sessionHash: string,
  data: Record<string, any>,
  scopes: string,
  bothSucceeded: boolean
): Promise<string> {
  const repository = getOAuthRepository();
  const resultId = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + PROBE_COOKIE_TTL_SECONDS * 1000);
  
  await repository.createProbeResult({
    resultId,
    sessionHash,
    data,
    scopes,
    bothSucceeded,
    expiresAt,
  });
  
  return resultId;
}

/**
 * Consume probe result from DB.
 */
export async function consumeProbeResult(
  rawState: string,
  sessionHash: string
): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, any>;
  scopes?: string;
  bothSucceeded?: boolean;
}> {
  const repository = getOAuthRepository();
  const result = await repository.consumeProbeResult(rawState, sessionHash);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  return {
    success: true,
    data: result.probeRecord?.data,
    scopes: result.probeRecord?.scopes,
    bothSucceeded: result.probeRecord?.bothSucceeded,
  };
}

// ============================================================================
// Display API Helpers
// ============================================================================

export async function fetchUserInfo(accessToken: string): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await response.json();
    return response.ok ? { success: true, data } : { success: false, error: `user_info: ${response.status}`, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function fetchVideoList(accessToken: string, maxCount: number = 20): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: maxCount }),
      }
    );
    const data = await response.json();
    return response.ok ? { success: true, data } : { success: false, error: `video_list: ${response.status}`, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  const config = getConfig();
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
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

// Classification:
// - PII identifiers (open_id, union_id, etc.): ALWAYS redacted
// - Display names (display_name, username, nickname): ALWAYS redacted  
// - Generic name fields: redacted conservatively
// - Video titles: redacted unless a verification fixture explicitly needs content
//   (Current implementation: ALWAYS redacted for consistency)
// - URLs (avatar_url, cover_image_url): ALWAYS redacted (not stored)
// - Logs/tokens/emails/phones: ALWAYS redacted

const SENSITIVE_FIELDS = new Set([
  'open_id', 'union_id', 'display_name', 'avatar_url', 'cover_image_url',
  'username', 'nickname', 'log_id', 'email', 'phone',
  'access_token', 'refresh_token', 'name', 'title',
]);

export function sanitizeDisplayData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    // Redact ALL strings that could be sensitive
    if (data.startsWith('http://') || data.startsWith('https://')) return '<REDACTED>';
    if (data.length > 20 && /^[a-zA-Z0-9_-]+$/.test(data)) return '<REDACTED>';
    if (data.includes('@') && data.includes('.')) return '<REDACTED>';
    return '<REDACTED>';
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

export function validateEnvironment(): void {
  getConfig();
}
