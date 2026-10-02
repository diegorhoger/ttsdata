import { describe, expect, it, vi } from 'vitest';
import { DisplayApiAdapter, buildAuthorizeUrl, sanitizeProviderError } from '../../packages/db/src/display/adapter';

const config = { clientKey: 'ck', clientSecret: 'cs', redirectUri: 'https://ttsdata.netlify.app/api/callback' };

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('Display API adapter', () => {
  it('builds an authorize URL on the approved Display surface with approved scopes only', () => {
    const url = new URL(buildAuthorizeUrl(config, 'state-value'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('scope')).toBe('user.info.basic,user.info.stats,video.list');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('client_key')).toBe('ck');
  });

  it('never emits a Shop host or scope', () => {
    const url = buildAuthorizeUrl(config, 'state-value');
    expect(url).not.toContain('tiktokglobalshop');
    expect(url).not.toContain('shop.');
  });

  it('parses a successful token exchange', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: 'act-1', refresh_token: 'rft-1', expires_in: 3600, refresh_expires_in: 86400,
      scope: 'user.info.basic,user.info.stats,video.list', open_id: 'open-1',
    }));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const result = await adapter.exchangeAuthorizationCode(config, 'code-1');
    expect(result.accessToken).toBe('act-1');
    expect(result.expiresInSeconds).toBe(3600);
    expect(result.providerAccountHashInput).toBe('open-1');
    expect(result.scopes).toEqual(['user.info.basic', 'user.info.stats', 'video.list']);
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('grant_type=authorization_code');
  });

  it('fails closed on a malformed token payload', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(200, { access_token: 'a' })));
    await expect(adapter.exchangeAuthorizationCode(config, 'code-1')).rejects.toThrow(/refresh_token/);
  });

  it('sanitizes a provider error instead of echoing the body', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(401, {
      error: 'invalid_grant', error_description: 'code=secret-code-value',
    })));
    await expect(adapter.exchangeAuthorizationCode(config, 'code-1')).rejects.toMatchObject({
      errorCode: 'provider_unauthorized', status: 401,
    });
    try {
      await adapter.exchangeAuthorizationCode(config, 'code-1');
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('secret-code-value');
    }
  });

  it('maps provider statuses to stable codes', () => {
    expect(sanitizeProviderError(400)).toBe('provider_rejected_request');
    expect(sanitizeProviderError(429)).toBe('provider_rate_limited');
    expect(sanitizeProviderError(503)).toBe('provider_unavailable');
    expect(sanitizeProviderError(418)).toBe('provider_error_418');
  });

  it('performs refresh with the refresh grant', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {
      access_token: 'act-2', refresh_token: 'rft-2', expires_in: 1800, scope: 'user.info.basic,user.info.stats,video.list',
    }));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const result = await adapter.refreshAccessToken(config, 'rft-1');
    expect(result.accessToken).toBe('act-2');
    const body = String((fetchImpl.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('grant_type=refresh_token');
    expect(body).toContain('refresh_token=rft-1');
  });

  it('revokes against the approved Display revoke endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const result = await adapter.revoke('act-1', config);
    expect(result.confirmed).toBe(true);
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://open.tiktokapis.com/v2/oauth/revoke/');
  });

  it('fetches user info with a Bearer header and no Shop header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { data: { user: {} } }));
    const adapter = new DisplayApiAdapter(fetchImpl);
    const result = await adapter.fetchUserInfo('act-1');
    expect(result.ok).toBe(true);
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer act-1');
    expect(headers['x-tts-access-token']).toBeUndefined();
  });

  it('reports a provider failure without throwing', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockResolvedValue(jsonResponse(403, { error: 'scope' })));
    const result = await adapter.fetchVideoList('act-1');
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('provider_forbidden');
    expect(result.data).toBeNull();
  });

  it('reports an unreachable provider without throwing', async () => {
    const adapter = new DisplayApiAdapter(vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await adapter.fetchVideoList('act-1');
    expect(result.errorCode).toBe('provider_unreachable');
    expect(result.status).toBe(0);
  });
});
