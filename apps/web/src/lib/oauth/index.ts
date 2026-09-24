/**
 * OAuth Module — Server-side OAuth flow management for TikTok Display API
 * 
 * Handles:
 * - OAuth state registration and consumption (with DB persistence)
 * - Probe result storage and consumption (with DB persistence)
 * - Session management
 * - Token revocation
 * - Response sanitization
 * 
 * Uses OAuthRepository for durable PostgreSQL-backed storage.
 * Environment variables: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, 
 *   NEXT_PUBLIC_TIKTOK_REDIRECT_URI, OAUTH_STATE_SECRET, 
 *   OAUTH_SESSION_SECRET, DATABASE_URL
 */

import { 
  OAuthRepository,
  type OAuthConfig,
  type ConsumeStateResult,
  type ConsumeProbeResultResult,
} from '../../../../packages/db/src/repositories/oauth';
import { createHmac, randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// Configuration
// ============================================================================

const REPO_INSTANCE = new Map<string, OAuthRepository>();

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

function getRepository(): OAuthRepository {
  const key = `${process.env.DATABASE_URL}|${process.env.OAUTH_STATE_SECRET}|${process.env.OAUTH_SESSION_SECRET}`;
  if (!REPO_INSTANCE.has(key)) {
    REPO_INSTANCE.set(key, new OAuthRepository(
      process.env.DATABASE_URL || 'postgresql://localhost:5432/ttsdata',
      getConfig()
    ));
  }
  return REPO_INSTANCE.get(key)!;
}

// ============================================================================
// Session Management
// ============================================================================

const SESSION_COOKIE_NAME = 'ttsdata_session';
const SESSION_COOKIE_TTL_SECONDS = 3600; // 1 hour

/**
 * Create a session identity from request.
 * Uses a random session ID bound to the browser via HttpOnly cookie.
 */
export function createSessionIdentity(request: NextRequest): {
  sessionId: string;
  sessionHash: string;
} {
  const existingSessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (existingSessionId) {
    // Validate existing session
    const sessionHash = createHmac('sha256', getConfig().sessionSecret)
      .update(existingSessionId)
      .digest('hex');
    return { sessionId: existingSessionId, sessionHash };
  }

  // Create new session
  const sessionId = crypto.randomUUID();
  const sessionHash = createHmac('sha256', getConfig().sessionSecret)
    .update(sessionId)
    .digest('hex');
  
  return { sessionId, sessionHash };
}

// ============================================================================
// State Management
// ============================================================================

const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const STATE_COOKIE_TTL_SECONDS = 600; // 10 minutes

/**
 * Create OAuth state and set cookies.
 * Returns the raw state value for redirect to TikTok.
 */
export async function createOAuthState(request: NextRequest): Promise<{
  state: string;
  sessionId: string;
}> {
  const config = getConfig();
  const repository = getRepository();
  const { sessionId, sessionHash } = createSessionIdentity(request);

  const rawState = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await repository.createState({
    stateValue: rawState,
    sessionHash,
    expiresAt,
  });

  // Set cookies
  const response = new NextResponse(null);
  
  // State cookie (contains raw state so callback can read it)
  response.cookies.set(STATE_COOKIE_NAME, rawState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_COOKIE_TTL_SECONDS,
    path: '/',
  });
  
  // Session cookie
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_TTL_SECONDS,
    path: '/',
  });

  return { state: rawState, sessionId };
}

/**
 * Consume OAuth state.
 */
export async function consumeOAuthState(
  rawState: string,
  sessionHash: string
): Promise<ConsumeStateResult> {
  const repository = getRepository();
  return repository.consumeState(rawState, sessionHash);
}

// ============================================================================
// Probe Result Management
// ============================================================================

const PROBE_COOKIE_NAME = 'ttsdata_probe_result';
const PROBE_COOKIE_TTL_SECONDS = 300; // 5 minutes

/**
 * Store probe result and return the result ID.
 */
export async function storeProbeResult(
  sessionHash: string,
  data: Record<string, any>,
  scopes: string,
  bothSucceeded: boolean
): Promise<string> {
  const repository = getRepository();
  const resultId = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

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
 * Consume probe result atomically.
 */
export async function consumeProbeResult(
  resultId: string,
  sessionHash: string
): Promise<ConsumeProbeResultResult> {
  const repository = getRepository();
  return repository.consumeProbeResult(resultId, sessionHash);
}

/**
 * Create probe result cookie.
 */
export function createProbeResultCookie(resultId: string, sessionHash: string): string {
  const config = getConfig();
  const expiresIn = PROBE_COOKIE_TTL_SECONDS * 1000;
  const hmac = createHmac('sha256', config.sessionSecret)
    .update(`${resultId}.${sessionHash}.${Date.now()}`)
    .digest('hex');
  return `${resultId}.${sessionHash}.${hmac}`;
}

/**
 * Verify and decode probe result cookie.
 */
export function verifyProbeResultCookie(
  cookieValue: string,
  sessionHash: string
): { resultId: string } | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;

  const [resultId, cookieSessionHash, hmac] = parts;

  if (cookieSessionHash !== sessionHash) return null;

  // Check expiry (5 minutes)
  const timestamp = parseInt(hmac.slice(0, 10), 16);
  if (isNaN(timestamp) || Date.now() > timestamp + 5 * 60 * 1000) {
    return null;
  }

  // Verify HMAC
  const expectedHmac = createHmac('sha256', getConfig().sessionSecret)
    .update(`${resultId}.${sessionHash}.${Date.now()}`)
    .digest('hex');

  if (hmac !== expectedHmac) return null;

  return { resultId };
}

// ============================================================================
// Token Revocation
// ============================================================================

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
// Display API Probes
// ============================================================================

/**
 * Fetch user info from TikTok Display API.
 */
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

    if (response.ok) {
      return { success: true, data };
    }

    return { success: false, error: `user_info_failed: ${response.status}`, data };
  } catch (err) {
    return { success: false, error: `user_info_error: ${err}` };
  }
}

/**
 * Fetch video list from TikTok Display API.
 */
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

    if (response.ok) {
      return { success: true, data };
    }

    return { success: false, error: `video_list_failed: ${response.status}`, data };
  } catch (err) {
    return { success: false, error: `video_list_error: ${err}` };
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
  getConfig(); // Will throw if any required var is missing
}
