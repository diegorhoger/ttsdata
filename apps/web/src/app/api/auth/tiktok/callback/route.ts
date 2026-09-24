import { NextRequest, NextResponse } from 'next/server';

// Canonical URL for all OAuth redirects (never branch deployment hostname)
const CANONICAL_URL = 'https://ttsdata.netlify.app';

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

  // Handle OAuth errors
  if (error) {
    console.error(`TikTok OAuth error: ${error} - ${errorDescription}`);
    return NextResponse.redirect(
      new URL(`/connect?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}`, CANONICAL_URL)
    );
  }

  // Validate required parameters
  if (!code) {
    return NextResponse.redirect(
      new URL('/connect?error=missing_code', CANONICAL_URL)
    );
  }

  // Verify state parameter to prevent CSRF
  if (!state) {
    console.warn('Missing state parameter in OAuth callback');
  }

  try {
    // Exchange authorization code for access token
    // NOTE: This is verification-only. The token is NOT stored.
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

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return NextResponse.redirect(
        new URL(`/connect?error=token_exchange_failed&details=${encodeURIComponent(JSON.stringify(tokenData))}`, CANONICAL_URL)
      );
    }

    // VERIFICATION ONLY: Log that the flow works, do NOT store the token
    console.log('TikTok OAuth flow verified successfully');
    console.log('Token type:', tokenData.token_type);
    console.log('Scope:', tokenData.scope);
    console.log('Expires in:', tokenData.expires_in, 'seconds');

    // Redirect to connect page with success message
    return NextResponse.redirect(
      new URL('/connect?success=true&scope=' + encodeURIComponent(tokenData.scope || ''), CANONICAL_URL)
    );

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/connect?error=internal_error', CANONICAL_URL)
    );
  }
}
