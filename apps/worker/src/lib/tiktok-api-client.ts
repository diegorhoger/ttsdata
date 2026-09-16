/**
 * TikTok API Client — verified scopes only
 * 
 * Uses the confirmed scope inventory from TikTok Partner Center:
 * - user.info.basic, user.info.profile, user.info.stats
 * - video.list, video.upload, video.publish
 * - research.adlib.basic, research.data.basic
 * 
 * Authorization: OAuth 2.0
 * Auth URL: https://auth.tiktok-shops.com/oauth/authorize
 * Token URL: https://auth.tiktok-shops.com/api/v2/token/get
 * Access token header: x-tts-access-token
 */

export interface TikTokConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  authUrl: string;
}

export interface RequestOptions {
  method: 'GET' | 'POST';
  endpoint: string;
  params?: Record<string, string>;
  body?: any;
  accessToken: string;
}

export class TikTokAPIClient {
  private config: TikTokConfig;
  private rateLimits: Map<string, { remaining: number; resetAt: number }> = new Map();

  constructor(config: Partial<TikTokConfig> = {}) {
    this.config = {
      appId: config.appId || process.env.TIKTOK_APP_ID || '',
      appSecret: config.appSecret || process.env.TIKTOK_APP_SECRET || '',
      baseUrl: config.baseUrl || 'https://open-api.tiktok-shop.com',
      authUrl: config.authUrl || 'https://auth.tiktok-shops.com',
    };
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    // Check rate limit
    const limit = this.rateLimits.get(opts.endpoint);
    if (limit && limit.remaining <= 0 && Date.now() < limit.resetAt) {
      const waitMs = limit.resetAt - Date.now();
      console.log(`Rate limited on ${opts.endpoint}, waiting ${waitMs}ms`);
      await sleep(waitMs);
    }

    const url = new URL(`${this.config.baseUrl}${opts.endpoint}`);
    if (opts.params) {
      Object.entries(opts.params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const response = await fetch(url.toString(), {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        'x-tts-access-token': opts.accessToken,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    // Update rate limits from headers
    const remaining = response.headers.get('X-RateLimit-Remaining');
    const reset = response.headers.get('X-RateLimit-Reset');
    if (remaining && reset) {
      this.rateLimits.set(opts.endpoint, {
        remaining: parseInt(remaining),
        resetAt: parseInt(reset) * 1000,
      });
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`TikTok API error ${response.status}: ${error}`);
    }

    return response.json();
  }

  // User info endpoints (user.info.basic, user.info.profile, user.info.stats)
  async getUserInfo(accessToken: string, openId: string) {
    return this.request({
      method: 'GET',
      endpoint: '/api/v2/user/info/',
      params: { open_id: openId },
      accessToken,
    });
  }

  // Video list endpoint (video.list)
  async getVideoList(accessToken: string, openId: string, cursor?: string, count?: number) {
    return this.request({
      method: 'GET',
      endpoint: '/api/v2/video/list/',
      params: {
        open_id: openId,
        ...(cursor && { cursor }),
        ...(count && { count: String(count) }),
      },
      accessToken,
    });
  }

  // Research data endpoint (research.adlib.basic)
  async getResearchData(accessToken: string, params: Record<string, string>) {
    return this.request({
      method: 'GET',
      endpoint: '/api/v2/research/adlib/basic/',
      params,
      accessToken,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
