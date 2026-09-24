/**
 * OAuth Flow Security Tests
 * 
 * Tests for TikTok Display API OAuth flow.
 * Imports and exercises actual production functions.
 * 
 * Run with: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import { createSignedStateCookie, verifyStateCookie } from '../../apps/web/src/app/api/auth/tiktok/start/route';
import { createState, consumeState, storeProbeResult, consumeProbeResult, sanitizeDisplayData } from '../../apps/web/src/lib/oauth';

const TEST_SECRET = 'test-secret-value-for-testing-only';

describe('OAuth State Cookie Validation', () => {
  it('should accept valid state cookie', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt, TEST_SECRET);

    const result = verifyStateCookie(cookie, TEST_SECRET);
    expect(result).not.toBeNull();
    expect(result!.state).toBe(state);
    expect(result!.issuedAt).toBe(issuedAt);
  });

  it('should reject missing cookie', () => {
    expect(verifyStateCookie('', TEST_SECRET)).toBeNull();
  });

  it('should reject malformed cookie', () => {
    expect(verifyStateCookie('state.only', TEST_SECRET)).toBeNull();
    expect(verifyStateCookie('state.123', TEST_SECRET)).toBeNull();
  });

  it('should reject tampered state value', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt, TEST_SECRET);

    const tamperedCookie = cookie.replace(state, 'tampered-state');
    expect(verifyStateCookie(tamperedCookie, TEST_SECRET)).toBeNull();
  });

  it('should reject expired state', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now() - 601_000;
    const cookie = createSignedStateCookie(state, issuedAt, TEST_SECRET);

    expect(verifyStateCookie(cookie, TEST_SECRET)).toBeNull();
  });

  it('should reject wrong secret', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt, TEST_SECRET);

    expect(verifyStateCookie(cookie, 'wrong-secret')).toBeNull();
  });
});

describe('State Consumption (Single-Use)', () => {
  it('should consume state exactly once', () => {
    const sessionHash = 'test-session-hash';
    const state = createState(sessionHash, TEST_SECRET);

    const first = consumeState(state, sessionHash, TEST_SECRET);
    expect(first.valid).toBe(true);

    const second = consumeState(state, sessionHash, TEST_SECRET);
    expect(second.valid).toBe(false);
    expect(second.error).toBe('state_already_consumed');
  });

  it('should reject state with wrong session', () => {
    const state = createState('original-session', TEST_SECRET);

    const result = consumeState(state, 'different-session', TEST_SECRET);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('session_mismatch');
  });
});

describe('Probe Result Storage', () => {
  it('should store and consume probe result exactly once', () => {
    const sessionHash = 'test-session';
    const data = { userInfo: { test: true } };

    const resultId = storeProbeResult(sessionHash, data, 'user.info.basic', true);
    expect(resultId).toBeTruthy();

    const first = consumeProbeResult(resultId, sessionHash);
    expect(first.valid).toBe(true);
    expect(first.data).toEqual(data);

    const second = consumeProbeResult(resultId, sessionHash);
    expect(second.valid).toBe(false);
    expect(second.error).toBe('result_already_consumed');
  });

  it('should reject result with wrong session', () => {
    const data = { userInfo: { test: true } };
    const resultId = storeProbeResult('original-session', data, '', true);

    const result = consumeProbeResult(resultId, 'different-session');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('session_mismatch');
  });
});

describe('Sanitization', () => {
  it('should redact known sensitive fields', () => {
    const input = {
      open_id: 'abc123',
      union_id: 'def456',
      display_name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
      username: 'testuser',
      nickname: 'Test',
      log_id: 'log123',
      follower_count: 100,
    };

    const result = sanitizeDisplayData(input);
    expect(result.open_id).toBe('<REDACTED>');
    expect(result.union_id).toBe('<REDACTED>');
    expect(result.display_name).toBe('<REDACTED>');
    expect(result.avatar_url).toBe('<REDACTED>');
    expect(result.username).toBe('<REDACTED>');
    expect(result.nickname).toBe('<REDACTED>');
    expect(result.log_id).toBe('<REDACTED>');
    expect(result.follower_count).toBe(100);
  });

  it('should preserve structure and numeric values', () => {
    const input = {
      view_count: 12345,
      like_count: 678,
      is_verified: true,
      score: 95.5,
    };

    const result = sanitizeDisplayData(input);
    expect(result.view_count).toBe(12345);
    expect(result.like_count).toBe(678);
    expect(result.is_verified).toBe(true);
    expect(result.score).toBe(95.5);
  });

  it('should handle nested objects and arrays', () => {
    const input = {
      data: {
        user: { open_id: 'abc', name: 'Test', videos: [{ id: 'v1', title: 'Video 1' }] },
      },
    };

    const result = sanitizeDisplayData(input);
    expect(result.data.user.open_id).toBe('<REDACTED>');
    expect(result.data.user.name).toBe('<REDACTED>');
    expect(result.data.user.videos[0].id).toBe('<REDACTED>');
    expect(result.data.user.videos[0].title).toBe('<REDACTED>');
  });

  it('should handle null and boolean values', () => {
    expect(sanitizeDisplayData(null)).toBeNull();
    expect(sanitizeDisplayData(true)).toBe(true);
    expect(sanitizeDisplayData(false)).toBe(false);
  });
});
