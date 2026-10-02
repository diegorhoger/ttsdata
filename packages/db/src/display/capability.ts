/**
 * Issue #20 / #35 capability gate.
 *
 * The Display API family (open.tiktokapis.com, Bearer authorization) and the
 * TikTok Shop API family (open-api.tiktokglobalshop.com, x-tts-access-token)
 * are separate capability families. This node authorizes Display only.
 */

export const APPROVED_DISPLAY_SCOPES = ['user.info.basic', 'user.info.stats', 'video.list'] as const;
export type ApprovedDisplayScope = (typeof APPROVED_DISPLAY_SCOPES)[number];

export const DISPLAY_API_BASE = 'https://open.tiktokapis.com/v2';
export const DISPLAY_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';

/** Shop capability is not authorized by this node. Flipping this requires a separate capability decision. */
export const SHOP_CAPABILITY_ENABLED = false;

export class CapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityError';
  }
}

/**
 * Fail closed unless every requested scope is an approved Display scope.
 * Shop scopes and unknown scopes are rejected, never silently dropped.
 */
export function assertDisplayOnlyScopes(scopes: readonly string[]): ApprovedDisplayScope[] {
  if (!Array.isArray(scopes)) throw new CapabilityError('Display scopes must be an array');
  const approved = new Set<string>(APPROVED_DISPLAY_SCOPES);
  const normalized: string[] = [];
  for (const raw of scopes) {
    const scope = typeof raw === 'string' ? raw.trim() : '';
    if (scope === '') continue;
    if (scope.startsWith('shop.') || scope.includes('tiktokglobalshop')) {
      throw new CapabilityError(`Shop capability is not authorized by this node: ${scope}`);
    }
    if (!approved.has(scope)) throw new CapabilityError(`Unapproved Display scope requested: ${scope}`);
    if (!normalized.includes(scope)) normalized.push(scope);
  }
  if (normalized.length === 0) throw new CapabilityError('At least one approved Display scope is required');
  return normalized as ApprovedDisplayScope[];
}

/** Every approved scope must be present, otherwise the connection is not usable. */
export function assertAllApprovedScopesGranted(scopes: readonly string[]): ApprovedDisplayScope[] {
  const granted = new Set(assertDisplayOnlyScopes(scopes));
  const missing = APPROVED_DISPLAY_SCOPES.filter((scope) => !granted.has(scope));
  if (missing.length > 0) throw new CapabilityError(`Missing required Display scopes: ${missing.join(',')}`);
  return APPROVED_DISPLAY_SCOPES.slice();
}

/** Rejects any attempt to reach a Shop-family host or endpoint from a Display adapter. */
export function assertDisplayEndpointAllowed(url: string): void {
  if (url.includes('tiktokglobalshop.com') || url.includes('auth.tiktok-shops.com')) {
    throw new CapabilityError('Shop API endpoints are not authorized by this node');
  }
  if (!url.startsWith(DISPLAY_API_BASE) && !url.startsWith(DISPLAY_AUTHORIZE_URL)) {
    throw new CapabilityError(`Endpoint outside the approved Display surface: ${url}`);
  }
  if (!SHOP_CAPABILITY_ENABLED) {
    // defensive: the constant documents the gate; the URL checks above are the enforcement
  }
}
