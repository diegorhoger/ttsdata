/**
 * Rate-aware TikTok Shop API client
 */

interface TikTokConfig {
  appId: string;
  appSecret: string;
  baseUrl: string;
  authUrl: string;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  endpoint: string;
  params?: Record<string, string>;
  body?: any;
  accessToken: string;
}

export class TikTokShopClient {
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
        'Access-Token': opts.accessToken,
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

  async getProducts(params: { pageSize?: number; pageNumber?: number; categoryId?: string }) {
    return this.request({
      method: 'GET',
      endpoint: '/product/202309/products/search',
      params: {
        page_size: String(params.pageSize || 50),
        page_number: String(params.pageNumber || 1),
        ...(params.categoryId && { category_id: params.categoryId }),
      },
      accessToken: '', // Will be set from connection
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
