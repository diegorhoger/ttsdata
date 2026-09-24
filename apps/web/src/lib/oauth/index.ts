/**
 * OAuth Module — Server-side OAuth flow helpers for TikTok Display API
 * 
 * Provides helper functions for OAuth routes.
 * All DB operations go through OAuthRepository.
 */

import { OAuthRepository, type OAuthConfig } from '../../../../packages/db/src/repositories/oauth';
import { createHmac, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const SESSION_COOKIE_NAME = 'ttsdata_session';
const STATE_COOKIE_TTL_SECONDS = 600;
const SESSION_COOKIE_TTL_SECONDS = 3600;
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';
const PROBE_COOKIE_TTL_SECONDS = 300;

function getConfig(): OAuthConfig {
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

const REPOSITORY_INSTANCE = new WeakMap<object, OAuthRepository>();

function getRepository(): OAuthRepository {
  // Use a global singleton keyed by DB URL - one repo per DB connection
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://localhost:5432/ttsdata';
  let repo = REPOSITORY_INSTANCE.get(databaseUrl);
  if (!repo) {
    repo = new OAuthRepository(databaseUrl, getConfig());
    REPOSITORY_INSTANCE.set(databaseUrl, repo);
  }
  return repo;
}

/**
 * Create session cookies and return session identity.
 */
export function createSessionCookies(): {
  sessionId: string;
  sessionHash: string;
  stateCookieValue: string;
  sessionCookieValue: string;
} {
  const config = getConfig();
  const sessionId = randomBytes(32).toString('hex');
  const sessionHash = createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('hex');

  const stateCookieValue = createStateCookieValue(sessionId, config.stateSecret);
  const sessionCookieValue = createSessionCookieValue(sessionId, config.sessionSecret);

  return { sessionId, sessionHash, stateCookieValue, sessionCookieValue };
}

function createStateCookieValue(sessionId: string, stateSecret: string): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', stateSecret)
    .update(`${sessionId}.${issuedAt}`)
    .digest('hex');
  return `${sessionId}.${issuedAt}.${hmac}`;
}

function createSessionCookieValue(sessionId: string, sessionSecret: string): string {
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', sessionSecret)
    .update(`${sessionId}.${issuedAt}`)
    .digest('hex');
  return `${sessionId}.${issuedAt}.${hmac}`;
}

/**
 * Verify state cookie and extract session ID.
 */
export function verifyStateCookie(cookieValue: string): { sessionId: string } | null {
  if (!cookieValue) return null;
  
  const config = getConfig();
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  
  const [sessionId, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);
  
  if (isNaN(issuedAt)) return null;
  if (Date.now() - issuedAt > STATE_COOKIE_TTL_SECONDS * 1000) return null;
  
  const expectedHmac = createHmac('sha256', config.stateSecret)
    .update(`${sessionId}.${issuedAt}`)
    .digest('hex');
  
  if (hmac !== expectedHmac) return null;
  
  return { sessionId };
}

/**
 * Verify session cookie and extract session ID.
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
  
  const expectedHmac = createHmac('sha256', config.sessionSecret)
    .update(`${sessionId}.${issuedAt}`)
    .digest('hex');
  
  if (hmac !== expectedHmac) return null;
  
  return { sessionId };
}

/**
 * Create probe result cookie.
 */
export function createProbeResultCookie(resultId: string, sessionId: string): string {
  const config = getConfig();
  const issuedAt = Date.now();
  const hmac = createHmac('sha256', config.sessionSecret)
    .update(`${resultId}.${sessionId}.${issuedAt}`)
    .digest('hex');
  return `${resultId}.${sessionId}.${hmac}`;
}

/**
 * Verify and decode probe result cookie.
 */
export function verifyProbeResultCookie(cookieValue: string): { resultId: string; sessionId: string } | null {
  if (!cookieValue) return null;
  
  const config = getConfig();
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  
  const [resultId, sessionId, hmac] = parts;
  const issuedAt = Date.now();
  
  const expectedHmac = createHmac('sha256', config.sessionSecret)
    .update(`${resultId}.${sessionId}.${issuedAt}`)
    .digest('hex');
  
  if (hmac !== expectedHmac) return null;
  
  return { resultId, sessionId };
}

// ============================================================================
// OAuth Flow Helpers
// ============================================================================

/**
 * Create OAuth state and redirect to TikTok.
 */
export async function createOAuthState(request: NextRequest): Promise<{
  state: string;
  sessionId: string;
}> {
  const config = getConfig();
  const repository = getRepository();
  const { sessionId, stateCookieValue, sessionCookieValue } = createSessionCookies();
  
  // Generate raw state value
  const rawState = randomBytes(32).toString('hex');
  
  // Store in DB
  const expiresAt = new Date(Date.now() + STATE_COOKIE_TTL_SECONDS * 1000);
  await repository.createState({
    stateValue: rawState,
    sessionHash: createHmac('sha256', config.sessionSecret)
      .update(sessionId)
      .digest('hex'),
    expiresAt,
  });

  // Set cookies in response
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

  return { state: rawState, sessionId };
}

/**
 * Consume OAuth state from DB.
 */
export async function consumeOAuthState(rawState: string, sessionHash: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const repository = getRepository();
  const result = await repository.consumeState(rawState, sessionHash);
  return { success: result.success, error: result.error };
}

/**
 * Store probe result in DB and return result ID.
 */
export async function storeProbeResult(
  sessionHash: string,
  data: Record<string, any>,
  scopes: string,
  bothSucceeded: boolean
): Promise<string> {
  const repository = getRepository();
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
  resultId: string,
  sessionHash: string
): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, any>;
  scopes?: string;
  bothSucceeded?: boolean;
}> {
  const repository = getRepository();
  const result = await repository.consumeProbeResult(resultId, sessionHash);
  
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

const SENSITIVE_FIELDS = new Set([
  'open_id', 'union_id', 'display_name', 'avatar_url', 'cover_image_url',
  'username', 'nickname', 'log_id', 'email', 'phone',
  'access_token', 'refresh_token',
]);

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

export function validateEnvironment(): void {
  getConfig();
}
