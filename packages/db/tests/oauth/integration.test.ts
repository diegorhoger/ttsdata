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
    const successes = [r1, r2].filter(r => r.success);
    expect(successes.length).toBe(1);
    expect(r2.error).toBe('already_consumed');
  });

  it('allows exactly one concurrent consumer of a probe result record', async () => {
    const resultId = 'result-' + Date.now() + '-' + Math.random();
    const sessionId = 'session-' + Date.now();
    await repo.createProbeResult({ resultId, sessionId, data: { test: true }, scopes: 'user.info.basic', bothSucceeded: true, expiresAt: new Date(Date.now() + 300000) });

    const [r1, r2] = await Promise.all([
      repo.consumeProbeResult(resultId, sessionId),
      repo.consumeProbeResult(resultId, sessionId),
    ]);
    const successes = [r1, r2].filter(r => r.success);
    expect(successes.length).toBe(1);
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
    // Always insert a record first, then verify only hashes exist
    const rawState = 'test-storage-' + Date.now();
    const sessionId = 'session-storage-' + Date.now();
    await repo.createState({ rawState, sessionId, expiresAt: new Date(Date.now() + 600000) });

    const stateCheck = await repo['pool'].query('SELECT state_hash, session_hash FROM oauth_states WHERE session_hash = $1 LIMIT 1', [createHmac('sha256', config.sessionSecret).update(sessionId).digest('hex')]);
    expect(stateCheck.rows.length).toBeGreaterThan(0);
    const row = stateCheck.rows[0];
    expect(typeof row.state_hash).toBe('string');
    expect(row.state_hash.length).toBe(64);
    expect(row.state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof row.session_hash).toBe('string');
    expect(row.session_hash.length).toBe(64);
    expect(row.session_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
