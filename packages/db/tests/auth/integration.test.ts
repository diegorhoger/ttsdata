/**
 * Authenticated API path — PostgreSQL-backed regression coverage.
 *
 * This test exists because the previous suite only ever exercised the
 * no-cookie branch: a protected route with no session returns 401 before any
 * database access, so the session-resolution query was never executed in CI.
 *
 * That blind spot let a real defect survive: `requireAuth` used Drizzle's
 * relational `db.query.*` + `with:` API, but this schema defines no
 * `relations()` metadata, so any request carrying a valid session cookie threw
 * `TypeError: Cannot read properties of undefined (reading 'referencedTable')`
 * inside `normalizeRelation` and returned HTTP 500.
 *
 * A 401 proves the route exists. It does not prove authentication works. These
 * tests send an actual persisted session cookie against real PostgreSQL.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!DATABASE_URL) throw new Error('Authenticated API tests require TEST_DATABASE_URL');
if (!new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('Authenticated API tests require a database name ending in _test');
}

// The API resolves its pool from DATABASE_URL at import time, and the Display
// route loads its own configuration from process.env at registration time, so
// the committed production contract must be present before the server imports.
process.env.DATABASE_URL = DATABASE_URL;
process.env.NODE_ENV = 'production';
process.env.ALLOW_LOCALHOST_DATABASE = 'true';
process.env.AUTH_SECRET = 'a'.repeat(48);
process.env.ALLOWED_ORIGINS = 'https://ttsdata.netlify.app';
process.env.API_ORIGIN = 'https://api.example.test';
process.env.TIKTOK_CLIENT_KEY = 'test-client-key';
process.env.TIKTOK_CLIENT_SECRET = 'test-client-secret-value';
process.env.NEXT_PUBLIC_TIKTOK_REDIRECT_URI = 'https://api.example.test/api/display/callback';
process.env.OAUTH_CANONICAL_ORIGIN = 'https://api.example.test';
process.env.OAUTH_STATE_SECRET = 'b'.repeat(48);
process.env.OAUTH_SESSION_SECRET = 'c'.repeat(48);
process.env.DISPLAY_CREDENTIAL_KEYS = JSON.stringify({ '1': randomBytes(32).toString('base64') });
process.env.DISPLAY_CREDENTIAL_VERSION = '1';

const pool = new Pool({ connectionString: DATABASE_URL });

let app: Awaited<ReturnType<typeof buildApp>>;
let buildApp: () => Promise<any>;

// Seeded graph, created per test so state cannot leak between cases.
let workspaceId: string;
let userId: string;
let sessionToken: string;

async function seedSession(options: { expiresAt?: Date } = {}) {
  workspaceId = randomUUID();
  userId = randomUUID();
  sessionToken = randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO workspaces (id, name, plan_code) VALUES ($1, $2, 'pro')`,
    [workspaceId, 'Auth Regression WS'],
  );
  await pool.query(
    `INSERT INTO users (id, workspace_id, email, password_hash, role)
     VALUES ($1, $2, $3, 'x', 'owner')`,
    [userId, workspaceId, `auth-${userId}@example.test`],
  );
  await pool.query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
    [userId, sessionToken, options.expiresAt ?? new Date(Date.now() + 3600_000)],
  );
}

beforeAll(async () => {
  // Import after DATABASE_URL is set so the pool targets the test database.
  const { buildServer } = await import('../../../../apps/api/src/server');
  const { loadRuntimeConfig } = await import('../../../../apps/api/src/lib/runtime-config');
  buildApp = async () => {
    const config = loadRuntimeConfig({
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL,
      AUTH_SECRET: 'a'.repeat(48),
      ALLOWED_ORIGINS: 'https://ttsdata.netlify.app',
      API_ORIGIN: 'https://api.example.test',
      // The committed smoke-test override: this suite runs against a local
      // test database, which production correctly rejects otherwise.
      ALLOW_LOCALHOST_DATABASE: 'true',
      // The Display route loads its own config at registration; supply the
      // committed contract so the app can boot in this test.
      TIKTOK_CLIENT_KEY: 'test-key',
      TIKTOK_CLIENT_SECRET: 'test-secret-value',
      NEXT_PUBLIC_TIKTOK_REDIRECT_URI: 'https://api.example.test/api/display/callback',
      OAUTH_CANONICAL_ORIGIN: 'https://api.example.test',
      OAUTH_STATE_SECRET: 'b'.repeat(48),
      OAUTH_SESSION_SECRET: 'c'.repeat(48),
      DISPLAY_CREDENTIAL_KEYS: JSON.stringify({ '1': randomBytes(32).toString('base64') }),
      DISPLAY_CREDENTIAL_VERSION: '1',
    } as NodeJS.ProcessEnv);
    return buildServer(config);
  };
});

beforeEach(async () => {
  await seedSession();
  app = await buildApp();
});

afterAll(async () => {
  if (app) await app.close();
  await pool.query('DELETE FROM users WHERE workspace_id = $1', [workspaceId]).catch(() => undefined);
  await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]).catch(() => undefined);
  await pool.end();
});

describe('authenticated API path (PostgreSQL)', () => {
  it('rejects a protected route with no cookie (401, unchanged)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/display/connections' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'UNAUTHORIZED' });
  });

  it('authenticates a valid persisted session instead of throwing', async () => {
    // This is the regression assertion: on the unfixed baseline this returns
    // 500 with a Drizzle normalizeRelation TypeError.
    const response = await app.inject({
      method: 'GET',
      url: '/api/display/connections',
      cookies: { session: sessionToken },
    });

    expect(response.statusCode).not.toBe(500);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ connections: [] });
  });

  it('resolves the correct user and workspace identity from the session', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { session: sessionToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: { id: userId, workspaceId, role: 'owner' },
    });
  });

  it('fails closed for an unknown session token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/display/connections',
      cookies: { session: randomBytes(32).toString('hex') },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'SESSION_EXPIRED' });
  });

  it('fails closed for an expired session', async () => {
    await seedSession({ expiresAt: new Date(Date.now() - 60_000) });
    const response = await app.inject({
      method: 'GET',
      url: '/api/display/connections',
      cookies: { session: sessionToken },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'SESSION_EXPIRED' });
  });

  it('reaches Display authorization orchestration past requireAuth', async () => {
    // Proves the authenticated path passes requireAuth and enters the #20
    // lifecycle. The provider is unreachable here, so a provider error is the
    // expected post-auth outcome — the point is that it is NOT a 401 and NOT a
    // Drizzle 500.
    const response = await app.inject({
      method: 'POST',
      url: '/api/display/connections/authorize',
      cookies: { session: sessionToken },
      payload: {},
    });

    expect(response.statusCode).not.toBe(401);
    expect(response.statusCode).not.toBe(500);
    // 201 = authorization URL issued; 502/503 = reached the provider layer.
    expect([201, 502, 503]).toContain(response.statusCode);
  });

  it('serves the authenticated product detail path without a normalization error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/products/${randomUUID()}`,
      cookies: { session: sessionToken },
    });
    // 404 is correct for an unknown product; 500 would mean the join repair failed.
    expect(response.statusCode).not.toBe(500);
    expect(response.statusCode).toBe(404);
  });
});
