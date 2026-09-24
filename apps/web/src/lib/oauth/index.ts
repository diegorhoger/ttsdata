/**
 * OAuth Module — Server-side OAuth flow helpers for TikTok Display API
 * Contracts: independent random rawState, sessionId, resultId.
 * All DB operations through OAuthRepository (shared DB, fail-closed).
 */

import { OAuthRepository } from '@ttsdata/db';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const SESSION_COOKIE_NAME = 'ttsdata_session';
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';

// Shared PostgreSQL pool (injected into repository; repository does not terminate it)
import { Pool } from 'pg';
let sharedPool: Pool | null = null;
function getSharedPool(): Pool {
  if (!sharedPool) {
    const url = process.env.DATABASE_URL;
    if (!url || url.trim() === '') throw new Error('DATABASE_URL is required');
    sharedPool = new Pool({ connectionString: url.trim() });
  }
  return sharedPool;
}
const STATE_TTL_SEC = 600;
const SESSION_TTL_SEC = 3600;
const PROBE_TTL_SEC = 300;

export interface OAuthConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  sessionSecret: string;
  resultSecret?: string;
}

function getConfig(): OAuthConfig {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI;
  const stateSecret = process.env.OAUTH_STATE_SECRET;
  const sessionSecret = process.env.OAUTH_SESSION_SECRET;

  if (!clientKey || clientKey.trim() === '') throw new Error('TIKTOK_CLIENT_KEY is required');
  if (!clientSecret || clientSecret.trim() === '') throw new Error('TIKTOK_CLIENT_SECRET is required');
  if (!redirectUri || redirectUri.trim() === '') throw new Error('NEXT_PUBLIC_TIKTOK_REDIRECT_URI is required');
  if (!stateSecret || stateSecret.trim() === '') throw new Error('OAUTH_STATE_SECRET is required');
  if (!sessionSecret || sessionSecret.trim() === '') throw new Error('OAUTH_SESSION_SECRET is required');

  return { clientKey: clientKey.trim(), clientSecret: clientSecret.trim(), redirectUri: redirectUri.trim(), stateSecret: stateSecret.trim(), sessionSecret: sessionSecret.trim() };
}

function getOAuthRepository(): OAuthRepository {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required and must not be empty');
  }
  // Shared repository instance would be preferred; this creates a new Pool per call
  // but the Pool uses the shared DB connection. For serverless: one Pool per invocation is acceptable.
  return new OAuthRepository(getSharedPool(), getConfig());
}

export function validateEnvironment(): void {
  getConfig();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim() === '') throw new Error('DATABASE_URL is required and must not be empty');
}

// ============================================================================
// Cookie construction / verification (signed, TTL-enforced, constant-time)
// ============================================================================


function isHexString(s: string): boolean {
  return /^[a-f0-9]+$/i.test(s) && s.length % 2 === 0;
}
function buildCookiePayload(value: string, timestampMs: number, secret: string): string {
  const payload = `${value}.${timestampMs}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifyCookiePayload(
  cookieValue: string,
  secret: string,
  ttlSeconds: number
): { value: string; timestampMs: number } | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;
  const [value, tsStr, hmac] = parts;
  const timestampMs = parseInt(tsStr, 10);
  if (isNaN(timestampMs)) return null;
  // Enforce TTL
  if (timestampMs > Date.now() + 5000) return null;  // Reject future-issued cookies
  if (Date.now() - timestampMs > ttlSeconds * 1000) return null;
  const payload = `${value}.${timestampMs}`;
  if (!isHexString(hmac) || hmac.length !== 64) return null;
  const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (hmacBuf.length !== expectedBuf.length) return null;
  try {
    if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;
  } catch {
    return null;
  }
  return { value, timestampMs };
}

export function createStateCookie(rawState: string): string {
  return buildCookiePayload(rawState, Date.now(), getConfig().stateSecret);
}

export function verifyStateCookie(value: string): { rawState: string } | null {
  const verified = verifyCookiePayload(value, getConfig().stateSecret, STATE_TTL_SEC);
  if (!verified) return null;
  return { rawState: verified.value };
}

export function createSessionCookie(sessionId: string): string {
  return buildCookiePayload(sessionId, Date.now(), getConfig().sessionSecret);
}

export function verifySessionCookie(value: string): { sessionId: string } | null {
  const verified = verifyCookiePayload(value, getConfig().sessionSecret, SESSION_TTL_SEC);
  if (!verified) return null;
  return { sessionId: verified.value };
}

export function createProbeCookie(resultId: string, sessionId: string): string {
  // Probe cookie contains resultId, sessionId, timestamp; signed under sessionSecret for consistency
  const payloadValue = `${resultId}.${sessionId}`;
  const timestampMs = Date.now();
  const payload = `${payloadValue}.${timestampMs}`;
  const hmac = createHmac('sha256', getConfig().sessionSecret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

export function verifyProbeCookie(value: string): { resultId: string; sessionId: string; timestampMs: number } | null {
  // Probe cookie: value.resultId.sessionId.timestamp.hmac
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const [rawState, sessionId, tsStr, hmac] = parts;
  const timestampMs = parseInt(tsStr, 10);
  if (isNaN(timestampMs)) return null;
  if (Date.now() - timestampMs > PROBE_TTL_SEC * 1000) return null;  // TTL enforced
  const payload = `${rawState}.${sessionId}.${timestampMs}`;
  if (!isHexString(hmac) || hmac.length !== 64) return null;
  const expectedHmac = createHmac('sha256', getConfig().sessionSecret).update(payload).digest('hex');
  const hmacBuf = Buffer.from(hmac, 'hex');
  const expectedBuf = Buffer.from(expectedHmac, 'hex');
  if (hmacBuf.length !== expectedBuf.length) return null;
  try {
    if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;
  } catch {
    return null;
  }
  return { resultId: rawState, sessionId, timestampMs };
}

// ============================================================================
// OAuth Flow Helpers
// ============================================================================

export async function createOAuthStateWithCookies(request: NextRequest): Promise<{
  authUrl: string;
  rawState: string;
  sessionId: string;
  response: NextResponse;
}> {
  const config = getConfig();
  const repository = getOAuthRepository();

  const rawState = randomBytes(32).toString('hex');
  const sessionId = randomBytes(32).toString('hex');  // INDEPENDENT of rawState

  const expiresAt = new Date(Date.now() + STATE_TTL_SEC * 1000);
  await repository.createState({ rawState, sessionId, expiresAt });

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', config.clientKey);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
  authUrl.searchParams.set('state', rawState);

  const response = new NextResponse(null);
  response.cookies.set(STATE_COOKIE_NAME, createStateCookie(rawState), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: STATE_TTL_SEC, path: '/',
  });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionCookie(sessionId), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: SESSION_TTL_SEC, path: '/',
  });
  return { authUrl: authUrl.toString(), rawState, sessionId, response };
}

export async function consumeOAuthState(rawState: string, sessionId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const repository = getOAuthRepository();
  const result = await repository.consumeState(rawState, sessionId);
  return { success: result.success, error: result.error };
}

export async function storeProbeResult(
  resultId: string,
  sessionId: string,
  data: Record<string, unknown>,
  scopes: string,
  bothSucceeded: boolean
): Promise<string> {
  const repository = getOAuthRepository();
  const expiresAt = new Date(Date.now() + PROBE_TTL_SEC * 1000);
  await repository.createProbeResult({ resultId, sessionId, data, scopes, bothSucceeded, expiresAt });
  return resultId;
}

export async function consumeProbeResult(resultId: string, sessionId: string): Promise<{
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
  scopes?: string;
  bothSucceeded?: boolean;
}> {
  const repository = getOAuthRepository();
  const result = await repository.consumeProbeResult(resultId, sessionId);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: result.data,
    scopes: result.scopes,
    bothSucceeded: result.bothSucceeded,
  };
}

export function sanitizeDisplayData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    if (data.startsWith('http://') || data.startsWith('https://')) return '<REDACTED>';
    // Redact identifiers and names
    return '<REDACTED>';
  }
  if (typeof data === 'number' || typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data.map(sanitizeDisplayData);
  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const sensitive = new Set([
        'open_id', 'union_id', 'display_name', 'avatar_url', 'cover_image_url',
        'username', 'nickname', 'log_id', 'email', 'phone', 'name', 'title',
      ]);
      if (sensitive.has(key)) {
        result[key] = '<REDACTED>';
      } else {
        result[key] = sanitizeDisplayData(value);
      }
    }
    return result;
  }
  return data;
}

export async function revokeToken(accessToken: string): Promise<boolean> {
  const config = getConfig();
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, token: accessToken }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchUserInfo(accessToken: string) {
  try {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    return res.ok ? { success: true, data } : { success: false, error: `user_info: ${res.status}`, data };
  } catch (err: any) {
    return { success: false, error: String(err) };
  }
}

export async function fetchVideoList(accessToken: string, maxCount = 20) {
  try {
    const res = await fetch(
      'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count',
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ max_count: maxCount }) }
    );
    const data = await res.json();
    return res.ok ? { success: true, data } : { success: false, error: `video_list: ${res.status}`, data };
  } catch (err: any) {
    return { success: false, error: String(err) };
  }
}

export function createSessionIdentity(request: NextRequest): { sessionId: string; sessionHash: string } {
  const sessionCookie = request.cookies.get('ttsdata_session')?.value;
  if (sessionCookie) {
    const verified = verifySessionCookie(sessionCookie);
    if (verified) {
      const sessionHash = createHmac('sha256', getConfig().sessionSecret).update(verified.sessionId).digest('hex');
      return { sessionId: verified.sessionId, sessionHash };
    }
  }
  const sessionId = randomBytes(32).toString('hex');
  const sessionHash = createHmac('sha256', getConfig().sessionSecret).update(sessionId).digest('hex');
  return { sessionId, sessionHash };
}

// Backward compatibility aliases
export const createOAuthState = createOAuthStateWithCookies;
export const createOAuthStateCookie = createStateCookie;
