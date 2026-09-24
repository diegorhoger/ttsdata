import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
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
} from '../../../../../../lib/oauth';

const CANONICAL_URL = 'https://ttsdata.netlify.app';
const STATE_COOKIE_NAME = 'ttsdata_oauth_state';
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';

export async function GET(request: NextRequest) {
  try {
    validateEnvironment();
  } catch (err) {
    console.error('OAuth callback: environment validation failed');
    const response = NextResponse.redirect(new URL('/connect?error=configuration_error', CANONICAL_URL));
    return response;
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  const stateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  const sessionCookie = request.cookies.get('ttsdata_session')?.value;

  const clearCookie = (response: NextResponse) => {
    response.cookies.set(STATE_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  };

  if (error) {
    console.error(`TikTok OAuth error: ${error}`);
    const response = NextResponse.redirect(new URL('/connect?error=oauth_failed', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  if (!stateCookie) {
    console.error('OAuth callback: missing state cookie');
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_cookie', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_code', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  if (!stateParam) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_state_param', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Verify state cookie to get session ID
  const stateVerification = verifyStateCookie(stateCookie);
  if (!stateVerification) {
    console.error('OAuth callback: invalid state cookie');
    const response = NextResponse.redirect(new URL('/connect?error=invalid_state_cookie', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Verify state param matches cookie
  if (stateParam !== stateVerification.resultId) {
    console.error('OAuth callback: state mismatch');
    const response = NextResponse.redirect(new URL('/connect?error=state_mismatch', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Consume state from DB
  const sessionHash = createSessionHash(sessionCookie);
  const stateResult = await consumeOAuthState(stateParam, sessionHash);

  if (!stateResult.success) {
    console.error('OAuth callback: state consumption failed', stateResult.error);
    const response = NextResponse.redirect(
      new URL(`/connect?error=${stateResult.error}`, CANONICAL_URL)
    );
    clearCookie(response);
    return response;
  }

  try {
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

    if (!tokenResponse.ok) {
      console.error('Token exchange failed');
      const response = NextResponse.redirect(new URL('/connect?error=token_exchange_failed', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      console.error('Token exchange: access_token missing');
      const response = NextResponse.redirect(new URL('/connect?error=missing_access_token', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

    const scopes = tokenData.scope || '';
    if (!scopes.includes('user.info.basic') && !scopes.includes('user.info.stats')) {
      console.error('Token exchange: insufficient scopes');
      const response = NextResponse.redirect(new URL('/connect?error=insufficient_scopes', CANONICAL_URL));
      clearCookie(response);
      return response;
    }

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
    const sanitized = sanitizeDisplayData(probeResults);

    const revoked = await revokeToken(accessToken);
    if (revoked) {
      console.log('Temporary token revoked');
    } else {
      console.error('Failed to revoke token');
    }

    const resultId = await storeProbeResult(sessionHash, sanitized, scopes, bothSucceeded);
    const probeCookie = createProbeResultCookie(resultId, sessionCookie);

    const successUrl = new URL('/oauth-result', CANONICAL_URL);
    successUrl.searchParams.set('result_id', resultId);

    const response = NextResponse.redirect(successUrl);
    clearCookie(response);
    response.cookies.set(PROBE_COOKIE_NAME, probeCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300,
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

function createSessionHash(sessionCookie: string): string {
  const config = getConfig();
  const parts = sessionCookie.split('.');
  if (parts.length !== 3) return '';
  const sessionId = parts[0];
  return createHmac('sha256', config.sessionSecret)
    .update(sessionId)
    .digest('hex');
}

function getConfig() {
  const stateSecret = process.env.OAUTH_STATE_SECRET || '';
  const sessionSecret = process.env.OAUTH_SESSION_SECRET || '';
  return { stateSecret, sessionSecret };
}
