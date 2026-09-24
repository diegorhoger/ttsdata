import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  consumeOAuthState,
  storeProbeResult,
  revokeToken,
  fetchUserInfo,
  fetchVideoList,
  sanitizeDisplayData,
  verifyStateCookie,
  verifySessionCookie,
  createProbeCookie,
  validateEnvironment,
} from '../../../../../lib/oauth';

const CANONICAL_URL = 'https://ttsdata.netlify.app';
const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';

// Required scopes for probe operations
const REQUIRED_SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  const stateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  const sessionCookie = request.cookies.get('ttsdata_session')?.value;

  const clearCookie = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    response.cookies.set('ttsdata_session', '', { maxAge: 0, path: '/' });
  };

  // Early exits with cookie clearing
  if (error) {
    console.error(`TikTok OAuth error: ${error}`);
    const response = NextResponse.redirect(new URL('/connect?error=oauth_failed', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  if (!stateCookie) {
    console.error('OAuth callback: missing state cookie');
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_cookie', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_code', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  if (!stateParam) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_param', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  // Verify state cookie - extract rawState for comparison with stateParam
  const stateVerification = verifyStateCookie(stateCookie);
  if (!stateVerification) {
    console.error('OAuth callback: invalid state cookie');
    const response = NextResponse.redirect(new URL('/connect?error=invalid_state_cookie', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  // CONSTANT-TIME comparison: stateParam (rawState from TikTok) vs rawState in cookie
  if (stateParam.length !== stateVerification.rawState.length) {
    console.error('OAuth callback: state length mismatch');
    const response = NextResponse.redirect(new URL('/connect?error=invalid_state', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }
  
  const stateBuf = Buffer.from(stateParam, 'hex');
  const rawStateBuf = Buffer.from(stateVerification.rawState, 'hex');
  if (!timingSafeEqual(stateBuf, rawStateBuf)) {
    console.error('OAuth callback: state mismatch');
    const response = NextResponse.redirect(new URL('/connect?error=state_mismatch', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  // Get session from session cookie
  if (!sessionCookie) {
    console.error('OAuth callback: missing session cookie');
    const response = NextResponse.redirect(new URL('/connect?error=missing_session_cookie', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  const sessionVerification = verifySessionCookie(sessionCookie);
  if (!sessionVerification) {
    console.error('OAuth callback: invalid session cookie');
    const response = NextResponse.redirect(new URL('/connect?error=invalid_session', CANONICAL_URL));
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  // Derive sessionHash from rawState (same as in createOAuthStateWithCookies)
  const config = getConfig();
  const sessionHash = createHmac('sha256', config.sessionSecret)
    .update(stateVerification.rawState)
    .digest('hex');

  // Consume state from DB (session-bound in SQL)
  const stateResult = await consumeOAuthState(stateVerification.rawState, sessionId);
  if (!stateResult.success) {
    console.error('OAuth callback: state consumption failed', stateResult.error);
    const response = NextResponse.redirect(
      new URL(`/connect?error=${stateResult.error}`, CANONICAL_URL)
    );
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    return response;
  }

  let accessToken: string | null = null;
  let tokenData: any = null;

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || '';

    // Token exchange
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

    tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed');
      return NextResponse.redirect(
        new URL('/connect?error=token_exchange_failed', CANONICAL_URL)
      );
    }

    accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('Token exchange: access_token missing');
      return NextResponse.redirect(
        new URL('/connect?error=missing_access_token', CANONICAL_URL)
      );
    }

    // Parse scopes into exact set and validate ALL required scopes
    const rawScopes = tokenData.scope || '';
    const scopeSet = new Set(rawScopes.split(',').map((s: string) => s.trim()).filter(Boolean));

    for (const required of REQUIRED_SCOPES) {
      if (!scopeSet.has(required)) {
        console.error('Token exchange: missing required scope', required);
        return NextResponse.redirect(
          new URL('/connect?error=insufficient_scopes', CANONICAL_URL)
        );
      }
    }

    // Run probes
    const probeResults: any = { userInfo: null, videoList: null, errors: [] };

    const userInfoResult = await fetchUserInfo(accessToken);
    if (userInfoResult.success) {
      probeResults.userInfo = userInfoResult.data;
    } else {
      probeResults.errors.push({ endpoint: 'user/info', status: userInfoResult.error });
    }

    const videoListResult = await fetchVideoList(accessToken);
    if (videoListResult.success) {
      probeResults.videoList = videoListResult.data;
    } else {
      probeResults.errors.push({ endpoint: 'video/list', status: videoListResult.error });
    }

    const bothSucceeded = probeResults.userInfo && probeResults.videoList && probeResults.errors.length === 0;
    const sanitized = sanitizeDisplayData(probeResults) as Record<string, unknown>;

    // Store probe result (session-bound in SQL)
    const resultId = await storeProbeResult(stateVerification.rawState, sessionHash, sanitized, rawScopes, bothSucceeded);
    const probeCookie = createProbeCookie(stateVerification.rawState, sessionVerification.sessionId);

    const successUrl = new URL('/oauth-result', CANONICAL_URL);
    successUrl.searchParams.set('result_id', resultId);

    const response = NextResponse.redirect(successUrl);
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
    response.cookies.set(PROBE_COOKIE_NAME, probeCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
      path: '/',
    });

    return response;
  } finally {
    // ALWAYS revoke token in finally block
    if (accessToken) {
      const revoked = await revokeToken(accessToken);
      if (revoked) {
        console.log('Temporary token revoked');
      } else {
        console.error('Failed to revoke token');
      }
    }
  }
}

function getConfig() {
  const stateSecret = process.env.OAUTH_STATE_SECRET || '';
  const sessionSecret = process.env.OAUTH_SESSION_SECRET || '';
  return { stateSecret, sessionSecret };
}
