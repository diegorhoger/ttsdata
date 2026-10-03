import { describe, expect, it } from 'vitest';
import {
  APPROVED_DISPLAY_SCOPES,
  assertDisplayOnlyScopes,
  assertAllApprovedScopesGranted,
  assertDisplayEndpointAllowed,
  SHOP_CAPABILITY_ENABLED,
} from '../../packages/db/src/display/capability';

describe('Display/Shop capability separation', () => {
  it('authorizes exactly the approved Display scope surface', () => {
    expect(APPROVED_DISPLAY_SCOPES).toEqual(['user.info.basic', 'user.info.stats', 'video.list']);
  });

  it('leaves the Shop capability gate closed', () => {
    expect(SHOP_CAPABILITY_ENABLED).toBe(false);
  });

  it('accepts only approved Display scopes', () => {
    expect(assertDisplayOnlyScopes(['user.info.basic', 'video.list'])).toEqual(['user.info.basic', 'video.list']);
  });

  it('rejects any Shop scope', () => {
    expect(() => assertDisplayOnlyScopes(['user.info.basic', 'shop.product.read'])).toThrow(/Shop capability is not authorized/);
  });

  it('rejects an unknown scope rather than silently dropping it', () => {
    expect(() => assertDisplayOnlyScopes(['user.info.basic', 'user.info.email'])).toThrow(/Unapproved Display scope/);
  });

  it('rejects an empty scope set', () => {
    expect(() => assertDisplayOnlyScopes([])).toThrow(/At least one approved Display scope/);
  });

  it('requires every approved scope to be granted', () => {
    expect(() => assertAllApprovedScopesGranted(['user.info.basic'])).toThrow(/Missing required Display scopes/);
    expect(assertAllApprovedScopesGranted(['video.list', 'user.info.stats', 'user.info.basic']))
      .toEqual(['user.info.basic', 'user.info.stats', 'video.list']);
  });

  it('blocks Shop-family hosts from a Display adapter', () => {
    expect(() => assertDisplayEndpointAllowed('https://open-api.tiktokglobalshop.com/order/search')).toThrow(/Shop API endpoints/);
    expect(() => assertDisplayEndpointAllowed('https://auth.tiktok-shops.com/oauth/token')).toThrow(/Shop API endpoints/);
  });

  it('blocks hosts outside the approved Display surface', () => {
    expect(() => assertDisplayEndpointAllowed('https://evil.example.com/v2/oauth/token/')).toThrow(/outside the approved Display surface/);
  });

  it('allows the approved Display endpoints', () => {
    expect(() => assertDisplayEndpointAllowed('https://open.tiktokapis.com/v2/oauth/token/')).not.toThrow();
    expect(() => assertDisplayEndpointAllowed('https://open.tiktokapis.com/v2/user/info/?fields=open_id')).not.toThrow();
    expect(() => assertDisplayEndpointAllowed('https://www.tiktok.com/v2/auth/authorize/')).not.toThrow();
  });
});
