import { NextRequest, NextResponse } from 'next/server';
import {
  consumeOAuthState,
  storeProbeResult,
  revokeToken,
  fetchUserInfo,
  fetchVideoList,
  sanitizeDisplayData,
  createProbeResultCookie,
  verifyProbeResultCookie,
  validateEnvironment,
} from '../../../../lib/oauth';

const CANONICAL_URL = 'https://ttsdata.netlify.app';
const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';

/**
 * GET /api/auth/tiktok/callback
 * 
 * TikTok OAuth callback with DB-backed state consumption,
 * Display API probes, and token revocation.
 */
export async function GET(request: NextRequest) {
  // Validate environment
  try {
    validateEnvironment();
  } catch (err) {
    console.error('OAuth callback: environment validation failed');
    const response = NextResponse.redirect(new URL('/connect?error=configuration_error', CANONICAL_URL));
    return response;
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Read cookies
  const stateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  const sessionCookie = request.cookies.get('ttsdata_session')?.value;

  // Clear state cookie on every terminal callback
  const clearCookie = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  };

  // Handle OAuth errors from TikTok
  if (error) {
    console.error(`TikTok OAuth error: ${error}`);
    const response = NextResponse.redirect(new URL('/connect?error=oauth_failed', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Validate state cookie exists
  if (!stateCookie) {
    console.error('OAuth callback: missing state cookie');
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_cookie', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Validate code
  if (!code) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_code', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Validate state from cookie
  if (!state) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_param', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Consume state from DB (atomically)
  try {
    const stateResult = await consumeOAuthState(state, sessionCookie || '');
    
    if (!stateResult.success) {
      console.error('OAuth callback: state consumption failed', stateResult.error);
      const response = NextResponse.redirect(
        new URL(`/connect?error=${stateResult.error}`, CANONICAL_URL)
      );
      clearCookie(response);
      return response;
    }
  } catch (err) {
    console.error('OAuth callback: state consumption error', err);
    const response = NextResponse.redirect(new URL('/connect?error=state_error', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  try {
    // Exchange authorization code for access token
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || '';

    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json() as any;

    // Validate token response
    if (!tokenResponse.ok) {
      console.error('Token exchange failed');
      const response = NextResponse.redirect(new URL('/connect?error=token_exchange_failed', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    // Validate access token exists
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('Token exchange: access_token missing');
      const response = NextResponse.redirect(new URL('/connect?error=missing_access_token', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    // Validate scopes
    const scopes = tokenData.scope || '';
    if (!scopes.includes('user.info.basic') && !scopes.includes('user.info.stats')) {
      console.error('Token exchange: insufficient scopes');
      const response = NextResponse.redirect(new URL('/connect?error=insufficient_scopes', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    const sessionHash = sessionCookie ? Buffer.from(sessionCookie, 'base64url').toString('hex') : '';

    // Call Display API endpoints — preserve exact envelopes
    const probeResults: any = {
      userInfo: null,
      videoList: null,
      errors: [],
    };

    // Fetch user info
    const userInfoResult = await fetchUserInfo(accessToken);
    if (userInfoResult.success) {
      probeResults.userInfo = userInfoResult.data;
    } else {
      probeResults.errors.push({ endpoint: 'user/info', status: userInfoResult.error });
    }

    // Fetch video list
    const videoListResult = await fetchVideoList(accessToken);
    if (videoListResult.success) {
      probeResults.videoList = videoListResult.data;
    } else {
      probeResults.errors.push({ endpoint: 'video/list', status: videoListResult.error });
    }

    const bothSucceeded = probeResults.userInfo && probeResults.videoList && probeResults.errors.length === 0;
    const sanitized = sanitizeDisplayData(probeResults);

    // Revoke token
    const revoked = await revokeToken(accessToken);
    if (revoked) {
      console.log('Temporary token revoked after verification');
    } else {
      console.error('Failed to revoke token');
    }

    // Store result in DB
    let resultId: string;
    try {
      resultId = await storeProbeResult(sessionHash, sanitized, scopes, bothSucceeded);
    } catch (err) {
      console.error('Failed to store probe result:', err);
      const response = NextResponse.redirect(new URL('/connect?error=storage_error', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    // Create probe result cookie
    const probeCookie = createProbeResultCookie(resultId, sessionHash);

    const successUrl = new URL('/oauth-result', CANONICAL_URL);
    successUrl.searchParams.set('result_id', resultId);

    const response = NextResponse.redirect(successUrl);
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, probeCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    const response = NextResponse.redirect(new URL('/connect?error=internal_error', CANONICAL_URL));
    clearCookie(response);
    return response;
  }
}
