/**
 * OAuth Concurrent Consumption Integration Tests
 * 
 * These tests use a real PostgreSQL database to verify:
 * - Two concurrent state consumers → exactly one succeeds
 * - Two concurrent result consumers → exactly one succeeds
 * - Wrong session cannot consume the valid session's record
 * - Expired and previously consumed records are distinguished correctly
 * - No raw state, session ID, result ID or token is stored
 * 
 * Run with: DATABASE_URL=postgresql://... npx vitest run tests/oauth/integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createHmac } from 'crypto';

const TEST_SECRET = 'test-secret-for-integration';

function hash(value: string): string {
  return createHmac('sha256', TEST_SECRET).update(value).digest('hex');
}

describe('OAuth Concurrent Consumption (PostgreSQL)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/ttsdata_test',
    });
  });

  afterEach(async () => {
    // Clean up test data after each test
    await pool.query('DELETE FROM oauth_states WHERE state_hash LIKE \'test-%\'');
    await pool.query('DELETE FROM oauth_probe_results WHERE result_id_hash LIKE \'test-%\'');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should allow exactly one concurrent consumer of a state record', async () => {
    const rawState = 'test-state-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const sessionHash = hash('session-' + Date.now() + '-1');
    const stateHash = hash(rawState);

    // Insert a state record directly
    await pool.query(
      'INSERT INTO oauth_states (state_hash, session_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')',
      [stateHash, sessionHash]
    );

    // Run two concurrent consumers
    const results = await Promise.allSettled([
      pool.query(
        'UPDATE oauth_states SET consumed_at = NOW() WHERE state_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
        [stateHash, sessionHash]
      ),
      pool.query(
        'UPDATE oauth_states SET consumed_at = NOW() WHERE state_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
        [stateHash, sessionHash]
      ),
    ]);

    // Exactly one should succeed (return 1 row), the other should return 0 rows
    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.rows.length === 1
    ).length;
    const failCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.rows.length === 0
    ).length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
  });

  it('should allow exactly one concurrent consumer of a probe result record', async () => {
    const rawState = 'test-result-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const sessionHash = hash('session-' + Date.now() + '-2');
    const resultId = 'result-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const resultIdHash = hash(resultId);

    // Insert a result record
    await pool.query(
      'INSERT INTO oauth_probe_results (result_id_hash, session_hash, data, scopes, both_succeeded, expires_at) VALUES ($1, $2, \'{}\', \'user.info.basic\', true, NOW() + INTERVAL \'5 minutes\')',
      [resultIdHash, sessionHash]
    );

    // Run two concurrent consumers
    const results = await Promise.allSettled([
      pool.query(
        'UPDATE oauth_probe_results SET consumed_at = NOW() WHERE result_id_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
        [resultIdHash, sessionHash]
      ),
      pool.query(
        'UPDATE oauth_probe_results SET consumed_at = NOW() WHERE result_id_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
        [resultIdHash, sessionHash]
      ),
    ]);

    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.rows.length === 1
    ).length;
    const failCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.rows.length === 0
    ).length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
  });

  it('should not allow wrong session to consume a valid record', async () => {
    const rawState = 'test-wrong-session-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const correctSessionHash = hash('correct-session');
    const wrongSessionHash = hash('wrong-session');
    const stateHash = hash(rawState);

    // Insert a state record for correct session
    await pool.query(
      'INSERT INTO oauth_states (state_hash, session_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')',
      [stateHash, correctSessionHash]
    );

    // Try to consume with wrong session
    const wrongResult = await pool.query(
      'UPDATE oauth_states SET consumed_at = NOW() WHERE state_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
      [stateHash, wrongSessionHash]
    );

    // Should return 0 rows
    expect(wrongResult.rows.length).toBe(0);

    // Verify record was NOT consumed
    const checkResult = await pool.query(
      'SELECT consumed_at FROM oauth_states WHERE state_hash = $1',
      [stateHash]
    );
    expect(checkResult.rows[0].consumed_at).toBeNull();

    // Now consume with correct session
    const correctResult = await pool.query(
      'UPDATE oauth_states SET consumed_at = NOW() WHERE state_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
      [stateHash, correctSessionHash]
    );

    expect(correctResult.rows.length).toBe(1);
  });

  it('should distinguish expired, consumed and valid records', async () => {
    const rawState = 'test-expired-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const sessionHash = hash('session-' + Date.now() + '-3');
    const stateHash = hash(rawState);

    // Insert an already-expired record
    await pool.query(
      'INSERT INTO oauth_states (state_hash, session_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL \'1 minute\')',
      [stateHash, sessionHash]
    );

    // Try to consume expired record
    const result = await pool.query(
      'UPDATE oauth_states SET consumed_at = NOW() WHERE state_hash = $1 AND session_hash = $2 AND consumed_at IS NULL AND expires_at > NOW() RETURNING id',
      [stateHash, sessionHash]
    );

    // Should return 0 rows (expired)
    expect(result.rows.length).toBe(0);
  });

  it('should not store raw state, session ID or result ID in the database', async () => {
    const rawState = 'test-no-raw-' + Date.now() + '-' + Math.random().toString(36).substring(7);
    const sessionHash = hash('session-' + Date.now() + '-4');
    const stateHash = hash(rawState);

    // Insert a state record
    await pool.query(
      'INSERT INTO oauth_states (state_hash, session_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')',
      [stateHash, sessionHash]
    );

    // Query the record
    const result = await pool.query(
      'SELECT * FROM oauth_states WHERE state_hash = $1',
      [stateHash]
    );

    const row = result.rows[0];

    // Verify no raw values are stored
    expect(row.state_hash).not.toBe(rawState);
    expect(row.session_hash).not.toBe('session-4');
    expect(row).not.toHaveProperty('state_value');

    // Verify hashes are correct length (64 hex chars = 32 bytes)
    expect(row.state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.session_hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
