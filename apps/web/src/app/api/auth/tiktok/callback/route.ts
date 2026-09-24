import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// Canonical URL for all OAuth redirects (never branch deployment hostname)
const CANONICAL_URL = 'https://ttsdata.netlify.app';

// In-memory state store (use Redis in production)
const stateStore = new Map<string, { createdAt: number; userId: string }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * TikTok OAuth Callback - Verification Only
 * 
 * This route handles the OAuth redirect from TikTok after user authorization.
 * It exchanges the authorization code for an access token and validates the response.
 * 
 * NO data ingestion, NO analytics, NO storage of user data.
 * This is purely a verification step to confirm the OAuth flow works correctly.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle OAuth errors from TikTok
  if (error) {
    // Sanitize: don't leak upstream error details into URL
    console.error(`TikTok OAuth error: ${error}`);
    return NextResponse.redirect(
      new URL('/connect?error=oauth_failed', CANONICAL_URL)
    );
  }

  // Validate required parameters
  if (!code) {
    return NextResponse.redirect(
      new URL('/connect?error=missing_code', CANONICAL_URL)
    );
  }

  // Validate state parameter (fail closed)
  if (!state) {
    console.error('OAuth callback: missing state parameter');
    return NextResponse.redirect(
      new URL('/connect?error=invalid_state', CANONICAL_URL)
    );
  }

  // Verify state exists and is valid (single-use, not expired)
  const stateData = stateStore.get(state);
  if (!stateData) {
    console.error('OAuth callback: state not found or expired');
    return NextResponse.redirect(
      new URL('/connect?error=invalid_state', CANONICAL_URL)
    );
  }

  // Check state expiration
  if (Date.now() - stateData.createdAt > STATE_TTL_MS) {
    stateStore.delete(state);
    console.error('OAuth callback: state expired');
    return NextResponse.redirect(
      new URL('/connect?error=state_expired', CANONICAL_URL)
    );
  }

  // Remove state (single-use)
  stateStore.delete(state);

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
      // Sanitize: don't leak upstream response into URL
      console.error('Token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL('/connect?error=token_exchange_failed', CANONICAL_URL)
      );
    }

    // VERIFICATION ONLY: Log that the flow works, do NOT store the token
    console.log('TikTok OAuth flow verified successfully');
    console.log('Token type:', tokenData.token_type);
    console.log('Scope:', tokenData.scope);
    console.log('Expires in:', tokenData.expires_in, 'seconds');

    // Call Display API endpoints for verification (server-side, no storage)
    const accessToken = tokenData.access_token;
    const displayResults: any = {};

    // Fetch user info
    try {
      const userInfoRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count',
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );
      displayResults.userInfo = await userInfoRes.json();
    } catch (err) {
      console.error('Failed to fetch user info:', err);
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
      displayResults.videoList = await videoListRes.json();
    } catch (err) {
      console.error('Failed to fetch video list:', err);
    }

    // Sanitize the results for display
    const sanitized = sanitizeDisplayData(displayResults);

    // Redirect to connect page with sanitized probe results
    // Store results temporarily (in-memory only, 5 min TTL)
    const probeId = randomBytes(16).toString('hex');
    probeStore.set(probeId, { data: sanitized, createdAt: Date.now() });

    return NextResponse.redirect(
      new URL(`/connect?success=true&scope=${encodeURIComponent(tokenData.scope || '')}&probe_id=${probeId}`, CANONICAL_URL)
    );

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/connect?error=internal_error', CANONICAL_URL)
    );
  }
}

// In-memory probe store (use Redis in production)
const probeStore = new Map<string, { data: any; createdAt: number }>();
const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sanitize display data for verification-only presentation.
 * Removes PII and sensitive identifiers.
 */
function sanitizeDisplayData(data: any) {
  const sanitized: any = {};

  if (data.userInfo?.data) {
    const user = data.userInfo.data;
    sanitized.userInfo = {
      open_id: '<USER_ID>',
      display_name: user.display_name ? '<DISPLAY_NAME>' : null,
      avatar_url: user.avatar_url ? '<URL>' : null,
      follower_count: user.follower_count,
      video_count: user.video_count,
    };
  }

  if (data.videoList?.data) {
    const videos = data.videoList.data;
    sanitized.videoList = {
      videos: (videos || []).map((v: any) => ({
        id: '<VIDEO_ID>',
        title: v.title ? '<VIDEO_TITLE>' : null,
        create_time: v.create_time,
        cover_image_url: v.cover_image_url ? '<URL>' : null,
        view_count: v.view_count,
        like_count: v.like_count,
        comment_count: v.comment_count,
        share_count: v.share_count,
      })),
      pagination: data.videoList.pagination || null,
    };
  }

  return sanitized;
}

/**
 * Generate a cryptographically secure state value.
 * Called by the connect page before redirecting to TikTok.
 */
export function generateOAuthState(userId: string): string {
  const state = randomBytes(32).toString('hex');
  stateStore.set(state, {
    createdAt: Date.now(),
    userId,
  });
  return state;
}
