/**
 * OAuth Callback Route Tests
 * Tests the callback handler with valid signed fixtures and proper mocks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Configure test environment variables
process.env.TIKTOK_CLIENT_KEY = 'test-client-key';
process.env.TIKTOK_CLIENT_SECRET = 'test-client-secret';
process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI = 'http://test';
process.env.OAUTH_STATE_SECRET = 'test-state-secret';
process.env.OAUTH_SESSION_SECRET = 'test-session-secret';
import { NextRequest } from 'next/server';

// Mock the OAuth module before importing the route handler
const { mockConsumeOAuthState, mockConsumeProbeResult } = vi.hoisted(() => ({
  mockConsumeOAuthState: vi.fn(),
  mockConsumeProbeResult: vi.fn(),
}));

vi.mock('../../../apps/web/src/lib/oauth', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    consumeOAuthState: mockConsumeOAuthState,
    consumeProbeResult: mockConsumeProbeResult,
  };
});

describe('Callback Route (signed fixtures)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConsumeOAuthState.mockReset();
    mockConsumeProbeResult.mockReset();
    mockClearCookie.mockReset();
  });

  it('rejects invalid hex state with redirect and clears all cookies', async () => {
    const { GET: callbackGET } = await import('../../../apps/web/src/app/api/auth/tiktok/callback/route');

    // Create request with valid signed state cookie containing non-hex state
    const rawState = 'not-hex!!!';
    const sessionId = 'test-session';

    // Build a valid signed state cookie using production signing
    const { createStateCookie } = await import('../../../apps/web/src/lib/oauth');
    const signedStateCookie = createStateCookie(rawState);

    const url = new URL('http://localhost/callback?code=testcode&state=not-hex!!!');
    const request = new NextRequest(url, {
      headers: {
        cookie: `ttsdata_oauth_state=${signedStateCookie}; ttsdata_session=${sessionId}`,
      },
    });

    // Mock consumeOAuthState to simulate valid state
    mockConsumeOAuthState.mockResolvedValue({ success: true });

    // Invoke the callback handler
    const response = await callbackGET(request);

    // Assert response exists
    expect(response).toBeDefined();

    // Assert redirect contains invalid_hex error
    const location = response.headers.get('location');
    expect(location).toContain('error=invalid_hex');

    // Verify consumeOAuthState was NOT called (hex validation prevents DB access)
    expect(mockConsumeOAuthState).not.toHaveBeenCalled();

    // Verify all three deletion cookies are returned (Max-Age=0)
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('ttsdata_oauth_state');
    expect(setCookie).toContain('ttsdata_session');
    expect(setCookie).toContain('ttsdata_probe_result');
  });

  it('rejects invalid session with redirect and clears all cookies', async () => {
    const { GET: callbackGET } = await import('../../../apps/web/src/app/api/auth/tiktok/callback/route');

    // Create request with valid signed state cookie and matching hex state
    const rawState = 'a'.repeat(64); // valid hex
    const sessionId = 'test-session';

    const { createStateCookie } = await import('../../../apps/web/src/lib/oauth');
    const signedStateCookie = createStateCookie(rawState);

    const url = new URL('http://localhost/callback?code=testcode&state=' + rawState);
    const request = new NextRequest(url, {
      headers: {
        cookie: `ttsdata_oauth_state=${signedStateCookie}; ttsdata_session=invalid; ttsdata_probe_result=test`,
      },
    });

    // Mock consumeOAuthState to simulate valid state
    mockConsumeOAuthState.mockResolvedValue({ success: true });

    // Invoke the callback handler
    const response = await callbackGET(request);

    // Assert response exists
    expect(response).toBeDefined();

    // Assert redirect contains invalid_session error
    const location = response.headers.get('location');
    expect(location).toContain('error=invalid_session');

    // Verify all three deletion cookies are returned (Max-Age=0)
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('ttsdata_oauth_state');
    expect(setCookie).toContain('ttsdata_session');
    expect(setCookie).toContain('ttsdata_probe_result');
  });
});
