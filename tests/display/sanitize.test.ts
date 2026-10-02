import { describe, expect, it } from 'vitest';
import {
  sanitizeDisplayEvidence,
  assertNoCredentialMaterial,
  containsCredentialMaterial,
  REDACTED,
} from '../../packages/db/src/display/sanitize';

describe('Display evidence sanitization', () => {
  it('redacts identifiers, names, and URLs recursively', () => {
    const sanitized = sanitizeDisplayEvidence({
      open_id: 'user-open-id', display_name: 'Someone', avatar_url: 'https://cdn.example.com/a.jpg',
      follower_count: 120, nested: { username: 'handle', video_count: 8 },
      items: [{ title: 'My video', id: '123', view_count: 10 }],
    });
    expect(sanitized).toEqual({
      open_id: REDACTED, display_name: REDACTED, avatar_url: REDACTED,
      follower_count: 120, nested: { username: REDACTED, video_count: 8 },
      items: [{ title: REDACTED, id: '123', view_count: 10 }],
    });
  });

  it('redacts tokens and authorization headers at any depth', () => {
    const sanitized = sanitizeDisplayEvidence({
      access_token: 'a'.repeat(40), refresh_token: 'b'.repeat(40),
      headers: { authorization: 'Bearer abcdefghijklmnopqrstuvwxyz' },
    }) as Record<string, unknown>;
    expect(sanitized.access_token).toBe(REDACTED);
    expect(sanitized.refresh_token).toBe(REDACTED);
    expect((sanitized.headers as Record<string, unknown>).authorization).toBe(REDACTED);
  });

  it('redacts an opaque token that appears under an unexpected key', () => {
    const sanitized = sanitizeDisplayEvidence({ data: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefgh' }) as Record<string, unknown>;
    expect(sanitized.data).toBe(REDACTED);
  });

  it('preserves structural and numeric values', () => {
    expect(sanitizeDisplayEvidence({ view_count: 10, is_verified: true, ratio: 0.5 }))
      .toEqual({ view_count: 10, is_verified: true, ratio: 0.5 });
    expect(sanitizeDisplayEvidence(null)).toBeNull();
  });

  it('detects credential material in a serialized payload', () => {
    expect(containsCredentialMaterial('{"access_token":"x"}')).toBe(true);
    expect(containsCredentialMaterial('{"follower_count":10}')).toBe(false);
  });

  it('fails closed when credential material survives sanitization', () => {
    expect(() => assertNoCredentialMaterial({ access_token: 'x' }, 'evidence')).toThrow(/credential material/);
    expect(() => assertNoCredentialMaterial({ follower_count: 1 }, 'evidence')).not.toThrow();
  });
});
