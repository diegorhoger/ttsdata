/**
 * Deployment smoke test — the packaged service must actually run.
 *
 * This exercises the real production code path: the compiled artifact
 * (`apps/api/dist/server.js`) booted with `NODE_ENV=production`, serving the
 * health route against a real PostgreSQL database, with a strict CORS
 * allow-list and graceful SIGTERM shutdown.
 *
 * It is an integration test (requires TEST_DATABASE_URL) and is intentionally
 * NOT a mock: a build that type-checks but cannot start is the exact defect
 * this node exists to catch.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
// Vitest runs from the repository root (vitest.config.ts is at the root), and
// `__dirname` is not reliably the test directory under all transform modes.
// Anchor on the working directory, which the config guarantees.
const REPO_ROOT = process.cwd();
const SERVER_ENTRY = resolve(REPO_ROOT, 'apps/api/dist/server.js');

const PORT = 4187;
const ALLOWED_ORIGIN = 'https://ttsdata.netlify.app';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    DATABASE_URL,
    // Explicit override: this sandbox has no remote database. The guard itself
    // is asserted separately in runtime-config.test.ts.
    ALLOW_LOCALHOST_DATABASE: 'true',
    AUTH_SECRET: randomBytes(32).toString('hex'),
    ALLOWED_ORIGINS: ALLOWED_ORIGIN,
    API_ORIGIN: 'https://api.ttsdata.example',
    TIKTOK_CLIENT_KEY: 'probe-client-key',
    TIKTOK_CLIENT_SECRET: randomBytes(16).toString('hex'),
    NEXT_PUBLIC_TIKTOK_REDIRECT_URI: 'https://api.ttsdata.example/api/display/callback',
    OAUTH_CANONICAL_ORIGIN: 'https://api.ttsdata.example',
    OAUTH_STATE_SECRET: randomBytes(32).toString('hex'),
    OAUTH_SESSION_SECRET: randomBytes(32).toString('hex'),
    DISPLAY_CREDENTIAL_KEYS: JSON.stringify({ '1': randomBytes(32).toString('base64') }),
    DISPLAY_CREDENTIAL_VERSION: '1',
  };
}

function startServer(env: NodeJS.ProcessEnv): ChildProcess {
  return spawn('node', [SERVER_ENTRY], { env, cwd: resolve(REPO_ROOT, 'apps/api'), stdio: ['ignore', 'pipe', 'pipe'] });
}

async function waitForHealth(timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function waitForExit(child: ChildProcess, timeoutMs = 15_000): Promise<number | null> {
  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(null), timeoutMs);
    child.once('exit', (code) => { clearTimeout(timer); resolvePromise(code); });
  });
}

/**
 * Run a child to completion and return both exit code and combined output.
 * Waits for the stdio streams to close, not just the 'exit' event, so a
 * fail-closed error written to stderr is never missed by a race.
 */
async function runToCompletion(env: NodeJS.ProcessEnv, timeoutMs = 20_000): Promise<{ code: number | null; output: string }> {
  const child = startServer(env);
  let output = '';
  child.stdout?.on('data', (chunk) => { output += String(chunk); });
  child.stderr?.on('data', (chunk) => { output += String(chunk); });
  const code = await waitForExit(child, timeoutMs);
  // Give buffered stream data a tick to flush after exit.
  await new Promise((r) => setTimeout(r, 200));
  return { code, output };
}

if (!DATABASE_URL) throw new Error('Deployment smoke test requires TEST_DATABASE_URL');
if (!new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('Deployment smoke test requires a database name ending in _test');
}

describe('deployment smoke — packaged apps/api', () => {
  it('produces a runnable artifact at the declared start path', () => {
    // The previous build emitted dist/apps/api/src/server.js while `start`
    // declared dist/server.js. This asserts the two agree.
    expect(existsSync(SERVER_ENTRY)).toBe(true);
  });

  describe('running service', () => {
    let child: ChildProcess;
    let output = '';

    beforeAll(async () => {
      child = startServer(baseEnv());
      child.stdout?.on('data', (chunk) => { output += String(chunk); });
      child.stderr?.on('data', (chunk) => { output += String(chunk); });
      const healthy = await waitForHealth();
      if (!healthy) throw new Error(`service did not become healthy. Output:\n${output}`);
    }, 30_000);

    afterAll(async () => {
      if (child && child.exitCode === null) {
        child.kill('SIGTERM');
        await waitForExit(child);
      }
    });

    it('serves /health with a live database round trip', async () => {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: 'ok', database: 'connected' });
    });

    it('serves /health/deep', async () => {
      const response = await fetch(`http://127.0.0.1:${PORT}/health/deep`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ status: 'healthy', checks: { database: 'ok' } });
    });

    it('echoes the origin only for an allow-listed client', async () => {
      const allowed = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { Origin: ALLOWED_ORIGIN } });
      expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);

      const denied = await fetch(`http://127.0.0.1:${PORT}/health`, { headers: { Origin: 'https://evil.example.com' } });
      expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('registers the Issue #20 Display lifecycle and requires authentication', async () => {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/display/connections`);
      // 401 proves the route exists and the auth preHandler runs; 404 would mean
      // the lifecycle is not deployed.
      expect(response.status).toBe(401);
    });

    it('never logs a secret value', () => {
      const env = baseEnv();
      expect(output).not.toContain(String(env.AUTH_SECRET));
      expect(output).not.toContain(String(env.TIKTOK_CLIENT_SECRET));
      expect(output).not.toContain(String(env.OAUTH_STATE_SECRET));
      expect(output).not.toContain(String(env.OAUTH_SESSION_SECRET));
      expect(output).not.toContain(String(env.DISPLAY_CREDENTIAL_KEYS));
    });

    it('shuts down gracefully on SIGTERM', async () => {
      child.kill('SIGTERM');
      const code = await waitForExit(child);
      expect(code).toBe(0);
    });
  });

  it('refuses to boot with missing production configuration', async () => {
    const env = baseEnv();
    delete env.AUTH_SECRET;
    const { code, output } = await runToCompletion(env);
    expect(code).not.toBe(0);
    expect(output).toMatch(/AUTH_SECRET is required/);
  }, 30_000);

  it('refuses to boot with a placeholder AUTH_SECRET', async () => {
    const { code, output } = await runToCompletion({ ...baseEnv(), AUTH_SECRET: 'dev-secret-change-in-production' });
    expect(code).not.toBe(0);
    expect(output).toMatch(/placeholder/);
  }, 30_000);

  it('refuses to boot with a wildcard CORS origin', async () => {
    const { code, output } = await runToCompletion({ ...baseEnv(), ALLOWED_ORIGINS: '*' });
    expect(code).not.toBe(0);
    expect(output).toMatch(/wildcard/);
  }, 30_000);
});
