import { NextRequest, NextResponse } from 'next/server';
import {
  getOAuthConfig,
  createState,
  consumeState,
  storeProbeResult,
  revokeToken,
  sanitizeDisplayData,
  createSessionHash,
} from '../../../lib/oauth';

const CANONICAL_URL = 'https://ttsdata.netlify.app';

/**
 * GET /api/auth/tiktok/callback
 * 
 * TikTok OAuth callback with proper state validation, Display API probes,
 * and token revocation. Verification-only — no data persistence.
 */
export async function GET(request: NextRequest) {
  const config = getOAuthConfig();

  // Clear state cookie on every terminal callback
  const clearCookie = (response: NextResponse) => {
    response.cookies.set('ttsdata_oauth_state', '', { maxAge: 0, path: '/' });
  };

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Create session hash from request
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const sessionHash = createSessionHash(userAgent, ip, Date.now());

  // Handle OAuth errors
  if (error) {
    console.error(`TikTok OAuth error: ${error}`);
    const response = NextResponse.redirect(new URL('/connect?error=oauth_failed', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Validate state
  if (!state) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_state', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Consume state atomically
  const stateResult = consumeState(state, sessionHash, config.stateSecret);
  if (!stateResult.valid) {
    console.error('OAuth callback: state validation failed', stateResult.error);
    const response = NextResponse.redirect(new URL(`/connect?error=${stateResult.error}`, CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  // Validate code
  if (!code) {
    const response = NextResponse.redirect(new URL('/connect?error=missing_code', CANONICAL_URL));
    clearCookie(response);
    return response;
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
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
    const scopes = tokenData.scope || '';

    // Call Display API endpoints — preserve exact envelopes
    const probeResults: any = {
      userInfo: null,
      videoList: null,
      errors: [],
    };

    // Fetch user info
    try {
      const userInfoRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const userInfoData = await userInfoRes.json();
      if (userInfoRes.ok) {
        probeResults.userInfo = userInfoData;
      } else {
        probeResults.errors.push({ endpoint: 'user/info', status: userInfoRes.status, body: userInfoData });
      }
    } catch (err) {
      probeResults.errors.push({ endpoint: 'user/info', error: String(err) });
    }

    // Fetch video list
    try {
      const videoListRes = await fetch(
        'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ max_count: 20 }),
        }
      );
      const videoListData = await videoListRes.json();
      if (videoListRes.ok) {
        probeResults.videoList = videoListData;
      } else {
        probeResults.errors.push({ endpoint: 'video/list', status: videoListRes.status, body: videoListData });
      }
    } catch (err) {
      probeResults.errors.push({ endpoint: 'video/list', error: String(err) });
    }

    const bothSucceeded = probeResults.userInfo && probeResults.videoList && probeResults.errors.length === 0;
    const sanitized = sanitizeDisplayData(probeResults);

    // Revoke token
    const revoked = await revokeToken(accessToken, config.clientKey, config.clientSecret);
    if (revoked) {
      console.log('Temporary token revoked after verification');
    } else {
      console.error('Failed to revoke token');
    }

    // Store result
    const resultId = storeProbeResult(sessionHash, sanitized, scopes, bothSucceeded);

    const successUrl = new URL('/oauth-result', CANONICAL_URL);
    successUrl.searchParams.set('result_id', resultId);

    const response = NextResponse.redirect(successUrl);
    clearCookie(response);
    return response;
  } catch (err) {
    console.error('OAuth callback error:', err);
    const response = NextResponse.redirect(new URL('/connect?error=internal_error', CANONICAL_URL));
    clearCookie(response);
    return response;
  }
}
