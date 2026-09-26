/**
 * OAuth Result Route Tests
 * Tests the result handler with valid signed fixtures and proper mocks.
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
const { mockConsumeProbeResult } = vi.hoisted(() => ({
  mockConsumeProbeResult: vi.fn(),
}));

vi.mock('../../../apps/web/src/lib/oauth', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    consumeProbeResult: mockConsumeProbeResult,
  };
});

describe('Result Route (signed fixtures)', () => {
  beforeEach(() => {
    vi.resetModules();
    mockConsumeProbeResult.mockReset();
  });

  it('returns 500 and clears probe cookie on database exception', async () => {
    const { GET: resultGET } = await import('../../../apps/web/src/app/api/oauth-result/route');

    // Create request with valid signed probe cookie
    const resultId = 'test-result-id';
    const sessionId = 'test-session';

    // Build a valid signed probe cookie using production signing
    const { createProbeCookie } = await import('../../../apps/web/src/lib/oauth');
    const signedProbeCookie = createProbeCookie(resultId, sessionId);

    const url = new URL('http://localhost/oauth-result?result_id=' + resultId);
    const request = new NextRequest(url, {
      headers: { cookie: `ttsdata_probe_result=${signedProbeCookie}` },
    });

    // Mock consumeProbeResult to reject (database exception)
    mockConsumeProbeResult.mockRejectedValue(new Error('Database connection lost'));

    // Invoke the result handler
    const response = await resultGET(request);

    // Assert response exists
    expect(response).toBeDefined();

    // Assert status 500
    expect(response.status).toBe(500);

    // Assert stable error body
    const body = await response.json();
    expect(body.error).toBeDefined();

    // Assert probe cookie deletion (Max-Age=0)
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('ttsdata_probe_result');

    // Verify consumeProbeResult was called with the signed fixture's exact identifiers
    expect(mockConsumeProbeResult).toHaveBeenCalled();
    const callArgs = mockConsumeProbeResult.mock.calls[0];
    expect(callArgs[0]).toBe('test-result-id');
    expect(callArgs[1]).toBe('test-session');
  });

  it('returns 403 and clears probe cookie on missing session', async () => {
    const { GET: resultGET } = await import('../../../apps/web/src/app/api/oauth-result/route');

    // Create request without session cookie
    const url = new URL('http://localhost/oauth-result?result_id=test-result-id');
    const request = new NextRequest(url, {
      headers: { },
    });

    // Invoke the result handler
    const response = await resultGET(request);

    // Assert response exists
    expect(response).toBeDefined();

    // Assert status 403
    expect(response.status).toBe(403);

    // Assert probe cookie deletion (Max-Age=0)
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('ttsdata_probe_result');
  });
});
