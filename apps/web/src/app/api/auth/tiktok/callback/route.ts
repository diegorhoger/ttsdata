import { NextRequest, NextResponse } from 'next/server';

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
    return NextResponse.json(
      { success: false, error, errorDescription },
      { status: 400 }
    );
  }

  // Validate required parameters
  if (!code) {
    return NextResponse.json(
      { success: false, error: 'missing_code' },
      { status: 400 }
    );
  }

  // Verify state parameter to prevent CSRF
  // In production, compare against stored state from the authorization request
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
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI || '',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return NextResponse.json(
        { success: false, error: 'token_exchange_failed', details: tokenData },
        { status: tokenResponse.status }
      );
    }

    // VERIFICATION ONLY: Log that the flow works, do NOT store the token
    console.log('TikTok OAuth flow verified successfully');
    console.log('Token type:', tokenData.token_type);
    console.log('Scope:', tokenData.scope);
    console.log('Expires in:', tokenData.expires_in, 'seconds');

    // Return success without exposing the token
    return NextResponse.json({
      success: true,
      message: 'OAuth flow verified successfully',
      scope: tokenData.scope,
      expires_in: tokenData.expires_in,
      // Token is intentionally NOT included in the response
    });

  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.json(
      { success: false, error: 'internal_error' },
      { status: 500 }
    );
  }
}
