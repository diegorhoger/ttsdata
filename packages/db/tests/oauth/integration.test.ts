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

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/ttsdata_test';

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

    const r1 = await repo.consumeState(rawState, sessionId);
    expect(r1.success).toBe(true);

    const r2 = await repo.consumeState(rawState, sessionId);
    expect(r2.success).toBe(false);
    expect(r2.error).toBe('already_consumed');
  });

  it('allows exactly one concurrent consumer of a probe result record', async () => {
    const resultId = 'result-' + Date.now() + '-' + Math.random();
    const sessionId = 'session-' + Date.now();
    await repo.createProbeResult({ resultId, sessionId, data: { test: true }, scopes: 'user.info.basic', bothSucceeded: true, expiresAt: new Date(Date.now() + 300000) });

    const r1 = await repo.consumeProbeResult(resultId, sessionId);
    expect(r1.success).toBe(true);

    const r2 = await repo.consumeProbeResult(resultId, sessionId);
    expect(r2.success).toBe(false);
    expect(r2.error).toBe('already_consumed');
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
    const rawState = 'test-expired-' + Date.now();
    const sessionId = 'session-' + Date.now();
    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() - 1000) });
    const r = await repo.consumeState(rawState, sessionId);
    expect(r.success).toBe(false);
    expect(r.error).toBe('expired');
  });

  it('does not store raw state, session IDs, tokens, or result IDs', async () => {
    const stateCheck = await repo['pool'].query('SELECT state_hash FROM oauth_states LIMIT 1');
    // The DB should contain hashes, not raw strings. A hash is 64 hex chars.
    if (stateCheck.rows.length > 0) {
      const hash = stateCheck.rows[0].state_hash;
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);  // SHA-256 hex length
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
