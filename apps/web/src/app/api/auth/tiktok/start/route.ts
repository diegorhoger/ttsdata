import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'ttsdata_oauth_state';
const STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * GET /api/auth/tiktok/start
 * 
 * Initiates TikTok OAuth flow.
 * Generates secure state, stores in signed HttpOnly cookie, redirects to TikTok.
 */
export async function GET(request: NextRequest) {
  // Generate cryptographically secure state
  const state = randomBytes(32).toString('hex');
  const issuedAt = Date.now();

  // Create signed state cookie value
  const cookieValue = createSignedStateCookie(state, issuedAt);

  // Build TikTok authorization URL
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || 'https://ttsdata.netlify.app/api/auth/tiktok/callback';
  const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '';

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
  authUrl.searchParams.set('state', state);

  // Set state cookie and redirect
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_TTL_SECONDS,
    path: '/',
  });

  return response;
}

/**
 * Create HMAC-signed state cookie value.
 * Format: state.issuedAt.hmac
 */
function createSignedStateCookie(state: string, issuedAt: number): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET is not configured');
  }
  const hmac = createHmac('sha256', secret)
    .update(`${state}.${issuedAt}`)
    .digest('hex');
  return `${state}.${issuedAt}.${hmac}`;
}

/**
 * Verify and decode state cookie.
 * Returns null if invalid, expired, or tampered.
 */
export function verifyStateCookie(cookieValue: string): { state: string; issuedAt: number } | null {
  if (!cookieValue) return null;

  const parts = cookieValue.split('.');
  if (parts.length !== 3) return null;

  const [state, issuedAtStr, hmac] = parts;
  const issuedAt = parseInt(issuedAtStr, 10);

  if (isNaN(issuedAt)) return null;

  // Check expiration
  if (Date.now() - issuedAt > STATE_TTL_SECONDS * 1000) return null;

  // Verify HMAC
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET is not configured');
  }
  const expectedHmac = createHmac('sha256', secret)
    .update(`${state}.${issuedAt}`)
    .digest('hex');

  const hmacBuffer = Buffer.from(hmac, 'hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  if (hmacBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(hmacBuffer, expectedBuffer)) return null;

  return { state, issuedAt };
}
