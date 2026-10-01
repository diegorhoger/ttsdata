import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { Pool } from 'pg';
import { CCOSDashboardRepository, CCOSRepository } from '@ttsdata/db';
import { registerCCOSRoutes } from '../src/routes/ccos';

const DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!DATABASE_URL || !new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('Dashboard API integration tests require TEST_DATABASE_URL ending in _test');
}

describe('CCOS dashboard API to PostgreSQL', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new CCOSRepository(pool);
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ('Dashboard API tenant A'), ('Dashboard API tenant B') RETURNING id`,
    );
    [workspaceA, workspaceB] = result.rows.map((row) => row.id);
  });

  afterAll(async () => {
    const workspaceIds = [workspaceA, workspaceB].filter(Boolean);
    if (workspaceIds.length) {
      await pool.query('DELETE FROM users WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [workspaceIds]);
    }
    await pool.end();
  });

  it('binds the real dashboard repository to the authenticated tenant and rejects query overrides', async () => {
    const brand = await repository.createStore({ workspaceId: workspaceA, name: 'API dashboard brand' });
    const app = Fastify();
    let authenticatedWorkspace = workspaceA;
    await app.register(registerCCOSRoutes, {
      prefix: '/api/ccos',
      dashboardRepository: new CCOSDashboardRepository(pool),
      authenticate: async (request) => {
        request.auth = { userId: randomUUID(), workspaceId: authenticatedWorkspace, role: 'viewer' };
      },
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/api/ccos/dashboard' });
      expect(response.statusCode).toBe(200);
      expect(response.json().stores.map((item: { id: string }) => item.id)).toContain(brand.id);

      authenticatedWorkspace = workspaceB;
      const isolated = await app.inject({ method: 'GET', url: '/api/ccos/dashboard' });
      expect(isolated.statusCode).toBe(200);
      expect(isolated.json().stores.map((item: { id: string }) => item.id)).not.toContain(brand.id);

      const override = await app.inject({ method: 'GET', url: `/api/ccos/dashboard?workspaceId=${workspaceA}` });
      expect(override.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
