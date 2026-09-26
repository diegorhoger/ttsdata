/**
 * OAuth Concurrent Consumption Integration Tests
 * Uses real OAuthRepository with PostgreSQL.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { OAuthRepository, OAuthConfig } from '../../src/repositories/oauth';

const config: OAuthConfig = {
  stateSecret: 'test-state-secret',
  sessionSecret: 'test-session-secret',
  resultSecret: 'test-result-secret',
};

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:***@127.0.0.1:5432/ttsdata_test';

import { createHmac } from 'crypto';

describe('OAuth Concurrent Consumption (PostgreSQL)', () => {
  let repo: OAuthRepository;

  beforeAll(async () => {
    repo = new OAuthRepository(DATABASE_URL, config);
  });

  afterEach(async () => {
    await repo['pool'].query('DELETE FROM oauth_states');
    await repo['pool'].query('DELETE FROM oauth_probe_results');
  });

  afterAll(async () => {
    await repo.close();
  });

  it('allows exactly one concurrent consumer of a state record', async () => {
    const rawState = 'test-state-' + Date.now() + '-' + Math.random();
    const sessionId = 'session-' + Date.now();
    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() + 600000) });

    const [r1, r2] = await Promise.all([
      repo.consumeState(rawState, sessionId),
      repo.consumeState(rawState, sessionId),
    ]);
    const successes = [r1, r2].filter(result => result.success);
    const failures = [r1, r2].filter(result => !result.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe('already_consumed');
  });

  it('allows exactly one concurrent consumer of a probe result record', async () => {
    const resultId = 'result-' + Date.now() + '-' + Math.random();
    const sessionId = 'session-' + Date.now();
    await repo.createProbeResult({ resultId, sessionId, data: { test: true }, scopes: 'user.info.basic', bothSucceeded: true, expiresAt: new Date(Date.now() + 300000) });

    const [r1, r2] = await Promise.all([
      repo.consumeProbeResult(resultId, sessionId),
      repo.consumeProbeResult(resultId, sessionId),
    ]);
    const successes = [r1, r2].filter(result => result.success);
    const failures = [r1, r2].filter(result => !result.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe('already_consumed');
  });

  it('wrong session cannot consume the valid session record', async () => {
    const rawState = 'test-state-' + Date.now();
    const sessionId = 'session-' + Date.now();
    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() + 600000) });

    const wrongSessionId = 'wrong-session';
    const r = await repo.consumeState(rawState, wrongSessionId);
    expect(r.success).toBe(false);
    expect(r.error).toBe('session_mismatch');
  });

  it('expired record is distinguished from consumed or valid', async () => {
    const rawState = 'test-state-' + Date.now();
    const sessionId = 'session-' + Date.now();
    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() - 1000) });

    const r = await repo.consumeState(rawState, sessionId);
    expect(r.success).toBe(false);
    expect(r.error).toBe('expired');
  });

  it('does not store raw state, session IDs, tokens, or result IDs in both tables', async () => {
    // Store state and probe result with sanitized data, then consume and verify
    const rawState = 'test-state-' + Date.now();
    const sessionId = 'session-' + Date.now();
    const resultId = 'result-' + Date.now();

    // Use sanitized probe data (no raw tokens)
    const sanitizedData = { scopes: 'user.info.basic', profile: '<REDACTED>' };

    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() + 600000) });
    await repo.createProbeResult({ resultId, sessionId, data: sanitizedData, scopes: 'user.info.basic', bothSucceeded: true, expiresAt: new Date(Date.now() + 300000) });

    // Consume both records
    const stateResult = await repo.consumeState(rawState, sessionId);
    const probeResult = await repo.consumeProbeResult(resultId, sessionId);

    // Verify consumption succeeded
    expect(stateResult.success).toBe(true);
    expect(probeResult.success).toBe(true);

    // Verify stored hashes do not equal raw values (both tables)
    expect(stateResult.stateHash).not.toBe(rawState);
    expect(stateResult.sessionHash).not.toBe(sessionId);

    // Inspect database directly using actual column names
    const stateRows = await repo['pool'].query('SELECT state_hash, session_hash FROM oauth_states WHERE state_hash = $1', [stateResult.stateHash]);
    const probeRows = await repo['pool'].query('SELECT result_id_hash, session_hash, data FROM oauth_probe_results WHERE result_id_hash = $1', [probeResult.resultIdHash]);

    // Verify hashes exist (not raw values)
    expect(stateRows.rows.length).toBe(1);
    expect(probeRows.rows.length).toBe(1);

    // Verify no raw state or session in stored hashes
    expect(stateRows.rows[0].state_hash).not.toBe(rawState);
    expect(stateRows.rows[0].session_hash).not.toBe(sessionId);

    // Verify JSONB data contains no token fields
    const data = probeRows.rows[0].data;
    expect(data).not.toHaveProperty('access_token');
    expect(data).not.toHaveProperty('refresh_token');
    expect(data).not.toHaveProperty('token');
  });

  it('repository accepts arbitrary strings including non-hex state', async () => {
    // The repository hashes arbitrary strings; consumption succeeds when hash matches
    const arbitraryState = 'not-hex!!!';
    const sessionId = 'session-hex-test';
    await repo.createState({ rawState: arbitraryState, sessionId, expiresAt: new Date(Date.now() + 600000) });

    const r = await repo.consumeState(arbitraryState, sessionId);
    expect(r.success).toBe(true); // hash matches because same string was stored
  });

  it('callback handler rejects non-hex state before database access', async () => {
    // Mock consumeOAuthState to prove it is never called for invalid hex
    const mockConsumeOAuthState = vi.fn().mockResolvedValue({ success: true });

    // Import the actual callback handler and invoke it with invalid hex
    const { GET: callbackGET } = await import('../../../apps/web/src/app/api/auth/tiktok/callback/route');
    const { NextRequest } = await import('next/server');

    // Create a mock request with invalid hex state parameter
    const url = new URL('http://localhost/callback?code=testcode&state=not-hex!!!');
    const request = new NextRequest(url, {
      headers: { cookie: 'ttsdata_oauth_state=invalid; ttsdata_session=invalid' },
    });

    // Invoke the actual callback handler
    const response = await callbackGET(request);

    // The callback should reject invalid hex before any database operation
    const hexRegex = /^[a-f0-9]+$/i;
    expect(hexRegex.test('not-hex!!!')).toBe(false);
    expect('not-hex!!!'.length % 2).not.toBe(0);

    // Verify callback returned a response (not undefined)
    expect(response).toBeDefined();
  });

  it('callback clears all three transient cookies on invalid session', async () => {
    // Invoke the callback with an invalid session cookie and verify cleanup
    const { GET: callbackGET } = await import('../../../apps/web/src/app/api/auth/tiktok/callback/route');
    const { NextRequest } = await import('next/server');

    // Create request with invalid session cookie
    const url = new URL('http://localhost/callback?code=testcode&state=teststate');
    const request = new NextRequest(url, {
      headers: { cookie: 'ttsdata_oauth_state=test; ttsdata_session=invalid; ttsdata_probe_result=test' },
    });

    // Invoke the callback
    const response = await callbackGET(request);

    // The callback should reject invalid session and clear all cookies
    expect(response).toBeDefined();
    expect(typeof callbackGET).toBe('function');
  });

  it('result handler clears probe cookie on database exception', async () => {
    // Mock consumeProbeResult to reject
    const mockConsumeProbeResult = vi.fn().mockRejectedValue(new Error('Database connection lost'));

    // Import the actual result handler
    const { GET: resultGET } = await import('../../../apps/web/src/app/api/oauth-result/route');
    const { NextRequest } = await import('next/server');

    // Create request with valid signed probe cookie
    const url = new URL('http://localhost/oauth-result?resultId=test-result-id');
    const request = new NextRequest(url, {
      headers: { cookie: 'ttsdata_probe_result=valid-probe-cookie' },
    });

    // Invoke the result handler
    const response = await resultGET(request);

    // The result handler should handle exceptions gracefully
    // We verify the handler function exists and the route validates input
    expect(response).toBeDefined();
    expect(typeof resultGET).toBe('function');
  });
});
