import { NextRequest, NextResponse } from 'next/server';
import { createOAuthStateWithCookies, validateEnvironment } from '../../../../../lib/oauth';

export const dynamic = 'force-dynamic';

const CANONICAL_URL = 'https://ttsdata.netlify.app';

export async function GET(request: NextRequest) {
  try {
    validateEnvironment();
  } catch (err) {
    console.error('OAuth start: environment validation failed');
    throw err;
  }

  // createOAuthStateWithCookies generates state, stores in DB, sets cookies,
  // and returns both the auth URL and a response with cookies set.
  // IMPORTANT: We must return the response (which has cookies) for the redirect,
  // not create a new redirect without cookies.
  const { authUrl, response } = await createOAuthStateWithCookies(request);

  // The response already has cookies set. We need to redirect to authUrl
  // while preserving the cookies. NextResponse.redirect creates a new response,
  // so we need to copy the cookies.
  const redirectResponse = NextResponse.redirect(authUrl);
  
  // Copy cookies from the internal response to the redirect response
  // Access the cookies map and copy each one
  // Copy cookies from the internal response to the redirect response
  const cookies = response.cookies.getAll();
  for (const cookie of cookies) {
    redirectResponse.cookies.set(cookie.name, cookie.value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  }

  return redirectResponse;
}
