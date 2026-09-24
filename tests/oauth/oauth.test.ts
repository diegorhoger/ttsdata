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
import { storeProbeResult, getProbeResult, deleteProbeResult } from '../../apps/web/src/lib/probe-store';

const TEST_SECRET = 'test-secret-value-for-testing-only';

describe('OAuth State Cookie Validation (Production Functions)', () => {
  it('should accept valid state cookie', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt);

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
    const cookie = createSignedStateCookie(state, issuedAt);

    // Tamper with the state value
    const tamperedCookie = cookie.replace(state, 'tampered-state');
    expect(verifyStateCookie(tamperedCookie, TEST_SECRET)).toBeNull();
  });

  it('should reject expired state', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now() - 601_000; // 10 min + 1 sec ago
    const cookie = createSignedStateCookie(state, issuedAt);

    expect(verifyStateCookie(cookie, TEST_SECRET)).toBeNull();
  });

  it('should reject invalid issued timestamp', () => {
    const state = 'test-state-123';
    const cookie = `${state}.notanumber.hmacvalue`;
    expect(verifyStateCookie(cookie, TEST_SECRET)).toBeNull();
  });

  it('should reject forged HMAC', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const fakeHmac = 'a'.repeat(64);
    const cookie = `${state}.${issuedAt}.${fakeHmac}`;

    expect(verifyStateCookie(cookie, TEST_SECRET)).toBeNull();
  });

  it('should reject wrong secret', () => {
    const state = 'test-state-123';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt);

    expect(verifyStateCookie(cookie, 'wrong-secret')).toBeNull();
  });

  it('should validate state across simulated instances', () => {
    // Simulate: Instance A creates state cookie
    const state = 'cross-instance-state';
    const issuedAt = Date.now();
    const cookie = createSignedStateCookie(state, issuedAt);

    // Simulate: Instance B verifies state cookie
    const verified = verifyStateCookie(cookie, TEST_SECRET);
    expect(verified).not.toBeNull();
    expect(verified!.state).toBe(state);
  });
});

describe('Probe Store (Production Functions)', () => {
  it('should store and retrieve probe results', () => {
    const id = 'test-result-id';
    const data = { userInfo: { test: true }, videoList: { test: true } };

    storeProbeResult(id, { data, timestamp: Date.now(), scopes: 'user.info.basic', bothSucceeded: true });

    const result = getProbeResult(id);
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(data);
  });

  it('should return null for non-existent ID', () => {
    expect(getProbeResult('nonexistent')).toBeNull();
  });

  it('should delete results (single-use retrieval)', () => {
    const id = 'test-delete-id';
    storeProbeResult(id, { data: {}, timestamp: Date.now(), scopes: '', bothSucceeded: true });

    expect(getProbeResult(id)).not.toBeNull();
    deleteProbeResult(id);
    expect(getProbeResult(id)).toBeNull();
  });

  it('should handle oversized fixtures', () => {
    const id = 'test-large-id';
    const largeData = {
      userInfo: { videos: Array(1000).fill({ id: 'x', title: 'y' }) },
      videoList: { videos: Array(1000).fill({ id: 'x', title: 'y' }) },
    };

    storeProbeResult(id, { data: largeData, timestamp: Date.now(), scopes: '', bothSucceeded: true });

    const result = getProbeResult(id);
    expect(result).not.toBeNull();
    expect(result!.data.userInfo.videos).toHaveLength(1000);
  });
});
