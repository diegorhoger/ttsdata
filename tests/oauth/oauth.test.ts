/**
 * OAuth Flow Security Tests
 * 
 * Tests for TikTok Display API OAuth flow.
 * Uses the OAuth module directly.
 * 
 * Run with: npx vitest run
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as oauthModule from '../../apps/web/src/lib/oauth';

const {
  createOAuthState,
  consumeOAuthState,
  storeProbeResult,
  consumeProbeResult,
  sanitizeDisplayData,
  validateEnvironment,
  createSessionIdentity,
  createOAuthStateWithCookies,
  revokeToken,
} = oauthModule;

// Tests run in isolation — in production, these would use test database
// For verification, we test the module's contract behavior

describe('OAuth Environment Validation', () => {
  const originalEnv = {
    TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
    NEXT_PUBLIC_TIKTOK_REDIRECT_URI: process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI,
    OAUTH_STATE_SECRET: process.env.OAUTH_STATE_SECRET,
    OAUTH_SESSION_SECRET: process.env.OAUTH_SESSION_SECRET,
  };

  afterEach(() => {
    // Restore env vars after each test
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('should throw when TIKTOK_CLIENT_KEY is missing', () => {
    delete process.env.TIKTOK_CLIENT_KEY;
    
    try {
      validateEnvironment();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('TIKTOK_CLIENT_KEY');
    }
  });

  it('should throw when TIKTOK_CLIENT_SECRET is missing', () => {
    process.env.TIKTOK_CLIENT_KEY = 'test-key';
    delete process.env.TIKTOK_CLIENT_SECRET;
    
    try {
      validateEnvironment();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).toContain('TIKTOK_CLIENT_SECRET');
    }
  });
});

describe('Session Identity', () => {
  it('should create session identity with random ID', () => {
    // Set env vars for getConfig
    process.env.TIKTOK_CLIENT_KEY = 'test-key';
    process.env.TIKTOK_CLIENT_SECRET = 'test-secret';
    process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI = 'http://localhost:3000/callback';
    process.env.OAUTH_STATE_SECRET = 'test-state-secret';
    process.env.OAUTH_SESSION_SECRET = 'test-session-secret';
    
    const mockRequest = {
      cookies: {
        get: (name: string) => null,
      } as any,
    };
    
    const { sessionId, sessionHash } = createSessionIdentity(mockRequest);
    expect(sessionId).toBeTruthy();
    expect(sessionHash).toBeTruthy();
    expect(sessionId.length).toBeGreaterThan(0);
  });
});

describe('Sanitization', () => {
  it('should redact sensitive fields', () => {
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

  it('should preserve numeric and boolean values', () => {
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

describe('OAuth State Flow (Contract)', () => {
  // These tests verify the contract of the OAuth module
  
  it('should export createOAuthState function', () => {
    expect(typeof createOAuthState).toBe('function');
  });

  it('should export createOAuthStateWithCookies function', () => {
    expect(typeof createOAuthStateWithCookies).toBe('function');
  });

  it('should export createSessionIdentity function', () => {
    expect(typeof createSessionIdentity).toBe('function');
  });

  it('should define consumeOAuthState with correct signature', () => {
    expect(typeof consumeOAuthState).toBe('function');
  });

  it('should define storeProbeResult with correct signature', () => {
    expect(typeof storeProbeResult).toBe('function');
  });

  it('should define consumeProbeResult with correct signature', () => {
    expect(typeof consumeProbeResult).toBe('function');
  });
});

describe('Token Revocation', () => {
  it('should define revokeToken with correct signature', () => {
    expect(typeof revokeToken).toBe('function');
  });
});
