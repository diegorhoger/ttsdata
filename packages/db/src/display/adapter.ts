/**
 * TikTok Display API adapter — Issue #20 approved capability surface only.
 *
 * Family: open.tiktokapis.com (Bearer authorization). No Shop API host, header,
 * or scope is reachable from this module: the capability gate rejects any URL
 * outside the approved Display surface.
 */

import {
  APPROVED_DISPLAY_SCOPES,
  DISPLAY_API_BASE,
  DISPLAY_AUTHORIZE_URL,
  assertDisplayEndpointAllowed,
  type ApprovedDisplayScope,
} from './capability';

export type DisplayTokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number | null;
  scopes: string[];
  providerAccountHashInput: string;
};

export type DisplayOperationResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  errorCode: string | null;
};

export type DisplayCredentials = { clientKey: string; clientSecret: string; redirectUri: string };

export class DisplayApiError extends Error {
  constructor(message: string, readonly status: number, readonly errorCode: string) {
    super(message);
    this.name = 'DisplayApiError';
  }
}

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Never surface a provider error body: provider errors can echo back the
 * authorization code or client secret. Only a stable code and status escape.
 */
export function sanitizeProviderError(status: number): string {
  if (status === 400) return 'provider_rejected_request';
  if (status === 401) return 'provider_unauthorized';
  if (status === 403) return 'provider_forbidden';
  if (status === 429) return 'provider_rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return `provider_error_${status}`;
}

export function buildAuthorizeUrl(config: DisplayCredentials, rawState: string): string {
  const url = new URL(DISPLAY_AUTHORIZE_URL);
  assertDisplayEndpointAllowed(url.toString());
  url.searchParams.set('client_key', config.clientKey);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', APPROVED_DISPLAY_SCOPES.join(','));
  url.searchParams.set('state', rawState);
  return url.toString();
}

type FetchLike = typeof fetch;

export class DisplayApiAdapter {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  private async postForm(url: string, body: URLSearchParams): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
    assertDisplayEndpointAllowed(url);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await response.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    return { ok: response.ok, status: response.status, json };
  }

  async exchangeAuthorizationCode(config: DisplayCredentials, code: string): Promise<DisplayTokenResponse> {
    const { ok, status, json } = await this.postForm(`${DISPLAY_API_BASE}/oauth/token/`, new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
    }));
    if (!ok) throw new DisplayApiError('Authorization code exchange failed', status, sanitizeProviderError(status));
    return this.parseTokenPayload(json);
  }

  async refreshAccessToken(config: DisplayCredentials, refreshToken: string): Promise<DisplayTokenResponse> {
    const { ok, status, json } = await this.postForm(`${DISPLAY_API_BASE}/oauth/token/`, new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }));
    if (!ok) throw new DisplayApiError('Access token refresh failed', status, sanitizeProviderError(status));
    return this.parseTokenPayload(json);
  }

  async revoke(accessToken: string, config: DisplayCredentials): Promise<{ confirmed: boolean; status: number }> {
    const { ok, status } = await this.postForm(`${DISPLAY_API_BASE}/oauth/revoke/`, new URLSearchParams({
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      token: accessToken,
    }));
    return { confirmed: ok, status };
  }

  private parseTokenPayload(json: Record<string, unknown>): DisplayTokenResponse {
    const accessToken = typeof json.access_token === 'string' ? json.access_token : '';
    const refreshToken = typeof json.refresh_token === 'string' ? json.refresh_token : '';
    const expiresInSeconds = positiveInt(json.expires_in);
    if (!accessToken) throw new DisplayApiError('Provider response omitted access_token', 200, 'malformed_token_response');
    if (!refreshToken) throw new DisplayApiError('Provider response omitted refresh_token', 200, 'malformed_token_response');
    if (expiresInSeconds === null) throw new DisplayApiError('Provider response omitted a valid expires_in', 200, 'malformed_token_response');
    const rawScope = typeof json.scope === 'string' ? json.scope : '';
    const scopes = rawScope.split(',').map((item) => item.trim()).filter(Boolean);
    const openId = typeof json.open_id === 'string' ? json.open_id : '';
    return {
      accessToken,
      refreshToken,
      expiresInSeconds,
      refreshExpiresInSeconds: positiveInt(json.refresh_expires_in),
      scopes,
      providerAccountHashInput: openId,
    };
  }

  async fetchUserInfo(accessToken: string): Promise<DisplayOperationResult<Record<string, unknown>>> {
    const url = `${DISPLAY_API_BASE}/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count`;
    assertDisplayEndpointAllowed(url);
    try {
      const response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? json : null,
        errorCode: response.ok ? null : sanitizeProviderError(response.status),
      };
    } catch {
      return { ok: false, status: 0, data: null, errorCode: 'provider_unreachable' };
    }
  }

  async fetchVideoList(accessToken: string, maxCount = 20): Promise<DisplayOperationResult<Record<string, unknown>>> {
    const url = `${DISPLAY_API_BASE}/video/list/?fields=id,title,create_time,cover_image_url,share_url,video_description,duration,height,width,like_count,comment_count,share_count,view_count`;
    assertDisplayEndpointAllowed(url);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_count: maxCount }),
      });
      const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        ok: response.ok,
        status: response.status,
        data: response.ok ? json : null,
        errorCode: response.ok ? null : sanitizeProviderError(response.status),
      };
    } catch {
      return { ok: false, status: 0, data: null, errorCode: 'provider_unreachable' };
    }
  }
}

export { APPROVED_DISPLAY_SCOPES };
export type { ApprovedDisplayScope };
