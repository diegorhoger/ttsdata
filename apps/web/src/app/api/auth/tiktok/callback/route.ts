import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { verifyStateCookie } from '../start/route';

const CANONICAL_URL = 'https://ttsdata.netlify.app';
const PROBE_COOKIE_NAME = 'ttsdata_probe_result';
const PROBE_TTL_SECONDS = 300; // 5 minutes

/**
 * GET /api/auth/tiktok/callback
 * 
 * TikTok OAuth callback with proper state validation, Display API probes,
 * and token revocation. Verification-only — no data persistence.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth errors from TikTok
  if (error) {
    console.error(`TikTok OAuth error: ${error}`);
    return NextResponse.redirect(new URL('/connect?error=oauth_failed', CANONICAL_URL));
  }

  // Validate state from signed cookie
  const stateCookie = request.cookies.get('ttsdata_oauth_state')?.value;
  const verifiedState = stateCookie ? verifyStateCookie(stateCookie) : null;

  if (!verifiedState) {
    console.error('OAuth callback: invalid or missing state cookie');
    return NextResponse.redirect(new URL('/connect?error=invalid_state', CANONICAL_URL));
  }

  // Verify state matches exactly
  if (state !== verifiedState.state) {
    console.error('OAuth callback: state mismatch');
    return NextResponse.redirect(new URL('/connect?error=state_mismatch', CANONICAL_URL));
  }

  // Validate code
  if (!code) {
    return NextResponse.redirect(new URL('/connect?error=missing_code', CANONICAL_URL));
  }

  // Clear state cookie (single-use)
  const clearCookie = (response: NextResponse) => {
    response.cookies.set('ttsdata_oauth_state', '', { maxAge: 0, path: '/' });
  };

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || '',
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
        probeResults.errors.push({ endpoint: 'user.info', status: userInfoRes.status, body: userInfoData });
      }
    } catch (err) {
      probeResults.errors.push({ endpoint: 'user.info', error: String(err) });
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
        probeResults.errors.push({ endpoint: 'video.list', status: videoListRes.status, body: videoListData });
      }
    } catch (err) {
      probeResults.errors.push({ endpoint: 'video.list', error: String(err) });
    }

    // Check if both probes succeeded
    const bothSucceeded = probeResults.userInfo && probeResults.videoList && probeResults.errors.length === 0;

    // Sanitize for display — preserve structure, redact sensitive values
    const sanitized = sanitizeDisplayData(probeResults);

    // Revoke temporary token (best effort, don't fail if it errors)
    try {
      await fetch('https://open.tiktokapis.com/v2/oauth/revoke/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_KEY || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          token: accessToken,
        }),
      });
      console.log('Temporary token revoked after verification');
    } catch (err) {
      console.error('Failed to revoke token:', err);
    }

    // Store sanitized result in server-side TTL store (not cookie)
    const resultId = randomBytes(16).toString('hex');
    probeStore.set(resultId, {
      data: sanitized,
      timestamp: Date.now(),
      scopes,
      bothSucceeded,
    });

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

/**
 * Recursively sanitize display data.
 * Preserves exact structure, replaces sensitive values with placeholders.
 */
function sanitizeDisplayData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    if (data.startsWith('http')) return '<URL>';
    if (data.length > 20 && /^[a-zA-Z0-9_-]+$/.test(data)) return '<ID>';
    return data;
  }
  if (typeof data === 'number') return data;
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) return data.map(sanitizeDisplayData);
  if (typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (['open_id', 'union_id', 'display_name', 'avatar_url', 'cover_image_url'].includes(key)) {
        result[key] = '<REDACTED>';
      } else {
        result[key] = sanitizeDisplayData(value);
      }
    }
    return result;
  }
  return data;
}

/**
 * Create signed probe result cookie.
 */
function createSignedProbeCookie(data: any, timestamp: number): string {
  const secret = process.env.OAUTH_STATE_SECRET || 'development-secret-change-in-production';
  const payload = JSON.stringify({ data, timestamp });
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}.${hmac}`).toString('base64url');
}

/**
 * Verify and decode probe result cookie.
 */
export function verifyProbeCookie(cookieValue: string): any | null {
  if (!cookieValue) return null;
  try {
    const decoded = Buffer.from(cookieValue, 'base64url').toString();
    const lastDot = decoded.lastIndexOf('.');
    if (lastDot === -1) return null;
    const payload = decoded.slice(0, lastDot);
    const hmac = decoded.slice(lastDot + 1);
    const secret = process.env.OAUTH_STATE_SECRET || 'development-secret-change-in-production';
    const expectedHmac = createHmac('sha256', secret).update(payload).digest('hex');
    const hmacBuffer = Buffer.from(hmac, 'hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  if (hmacBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(hmacBuffer, expectedBuffer)) return null;
    const parsed = JSON.parse(payload);
    if (Date.now() - parsed.timestamp > PROBE_TTL_SECONDS * 1000) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
