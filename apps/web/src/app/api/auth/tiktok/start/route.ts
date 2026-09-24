import { NextRequest, NextResponse } from 'next/server';
import {
  createOAuthState,
  validateEnvironment,
} from '../../../lib/oauth';

/**
 * GET /api/auth/tiktok/start
 * 
 * Initiates TikTok OAuth flow.
 */
export async function GET(request: NextRequest) {
  try {
    validateEnvironment();
  } catch (err) {
    console.error('OAuth start: environment validation failed');
    throw err;
  }

  const { state, sessionId } = await createOAuthState(request);

  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const redirectUri = process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI || '';

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', clientKey);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
