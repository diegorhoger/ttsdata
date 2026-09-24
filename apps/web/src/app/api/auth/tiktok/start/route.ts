import { NextRequest, NextResponse } from 'next/server';
import {
  getOAuthConfig,
  createState,
  createStateCookieValue,
  createSessionCookieValue,
  createSession,
  validateEnvironment,
} from '../../../lib/oauth';

const COOKIE_STATE_NAME = 'ttsdata_oauth_state';
const COOKIE_SESSION_NAME = 'ttsdata_session';
const STATE_COOKIE_TTL_SECONDS = 600; // 10 minutes
const SESSION_COOKIE_TTL_SECONDS = 3600; // 1 hour

/**
 * GET /api/auth/tiktok/start
 * 
 * Initiates TikTok OAuth flow.
 * Validates environment, creates session, registers state, sets cookies, redirects to TikTok.
 */
export async function GET(request: NextRequest) {
  // Validate all required configuration
  try {
    validateEnvironment();
  } catch (err) {
    console.error('OAuth start: environment validation failed');
    throw err;
  }

  const config = getOAuthConfig();

  // Create session (would use request/cookies for session binding in production)
  // For verification-only, we use a simple session binding
  const sessionHash = createSession('verification-session');

  // Register state in store
  const rawState = createState(sessionHash, config.stateSecret);

  // Create cookie values
  const stateCookie = createStateCookieValue(rawState, sessionHash, config.stateSecret);
  const sessionCookie = createSessionCookieValue(sessionHash, config.stateSecret);

  // Build TikTok authorization URL
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', config.clientKey);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
  authUrl.searchParams.set('state', rawState);

  // Set cookies and redirect
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(COOKIE_STATE_NAME, stateCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: STATE_COOKIE_TTL_SECONDS,
    path: '/',
  });
  response.cookies.set(COOKIE_SESSION_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_TTL_SECONDS,
    path: '/',
  });

  return response;
}
