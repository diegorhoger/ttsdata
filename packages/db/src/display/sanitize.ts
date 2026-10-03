/**
 * Sanitization for Display API evidence that leaves the server boundary.
 *
 * Canonical placeholder is `<REDACTED>`. Identifiers, names, and any URL are
 * redacted recursively; only structural/aggregate values survive. This is the
 * single sanitizer used by probe storage, API responses, and audit metadata so a
 * secret cannot reach logs, analytics, or client bundles by a second path.
 */

export const REDACTED = '<REDACTED>';

/** Keys whose value is always replaced, at any depth. */
const ALWAYS_REDACT_KEYS = new Set([
  'access_token', 'refresh_token', 'token', 'id_token', 'client_secret', 'client_key',
  'app_secret', 'code', 'authorization', 'auth_code', 'secret', 'password', 'state',
  'session', 'session_id', 'open_id', 'union_id', 'display_name', 'username',
  'nickname', 'avatar_url', 'avatar_url_100', 'avatar_large_url', 'cover_image_url',
  'share_url', 'video_description', 'title', 'name', 'email', 'phone', 'log_id',
  'request_id', 'profile_deep_link', 'bio_description', 'signature',
]);

const URL_LIKE = /^(?:https?|ftp|data):/i;
const BEARER_LIKE = /bearer\s+\S+/i;
/** Provider tokens are long opaque strings; anything this long is treated as a credential. */
const OPAQUE_TOKEN_MIN = 32;

function redactString(value: string): string {
  if (URL_LIKE.test(value)) return REDACTED;
  if (BEARER_LIKE.test(value)) return REDACTED;
  if (value.length >= OPAQUE_TOKEN_MIN && /^[A-Za-z0-9._~+/=-]+$/.test(value)) return REDACTED;
  return value;
}

export function sanitizeDisplayEvidence(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeDisplayEvidence);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = ALWAYS_REDACT_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeDisplayEvidence(item);
    }
    return result;
  }
  return REDACTED;
}

/** True when the serialized payload still contains anything that looks like a credential. */
export function containsCredentialMaterial(serialized: string): boolean {
  return /(?:access_token|refresh_token|client_secret|bearer\s|eyJ[A-Za-z0-9_-]{8,})/i.test(serialized);
}

/**
 * Last line of defense before evidence is written or returned. If sanitization
 * missed something, fail closed rather than persist a credential.
 */
export function assertNoCredentialMaterial(value: unknown, label: string): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (containsCredentialMaterial(serialized)) {
    throw new Error(`Refusing to persist or return ${label}: credential material detected`);
  }
}
