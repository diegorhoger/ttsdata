import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CCOSRepository } from '../../src/repositories/ccos';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:***@127.0.0.1:5432/ttsdata_test';

describe('CCOS tenant isolation (PostgreSQL)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repository = new CCOSRepository(pool);
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    const workspaces = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ('CCOS tenant A'), ('CCOS tenant B') RETURNING id`,
    );
    [workspaceA, workspaceB] = workspaces.rows.map((row) => row.id);
  });

  afterAll(async () => {
    const workspaceIds = [workspaceA, workspaceB].filter(Boolean);
    if (workspaceIds.length > 0) {
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [workspaceIds]);
    }
    await pool.end();
  });

  it('fails closed when another workspace reads a store', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Tenant A Store' });

    await expect(repository.getStore(workspaceA, store.id)).resolves.toMatchObject({ name: 'Tenant A Store' });
    await expect(repository.getStore(workspaceB, store.id)).resolves.toBeNull();
  });

  it('rejects cross-workspace relationship writes at the database boundary', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Protected Store' });

    await expect(repository.createPartnership({
      workspaceId: workspaceB,
      storeId: store.id,
      type: 'inbound_invite',
    })).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects assigning an action to a user from another workspace', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Action Store' });
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, email, password_hash)
       VALUES ($1, $2, 'test-only') RETURNING id`,
      [workspaceB, `ccos-${Date.now()}@example.test`],
    );

    await expect(pool.query(
      `INSERT INTO ccos_next_actions (workspace_id, store_id, title, owner_user_id)
       VALUES ($1, $2, 'Cross-tenant owner', $3)`,
      [workspaceA, store.id, user.rows[0].id],
    )).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects dangling, ambiguous and cross-workspace action targets', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Target Store' });

    await expect(pool.query(
      `INSERT INTO ccos_next_actions (workspace_id, title) VALUES ($1, 'No target')`,
      [workspaceA],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(pool.query(
      `INSERT INTO ccos_next_actions (workspace_id, store_id, partnership_id, title)
       VALUES ($1, $2, gen_random_uuid(), 'Two targets')`,
      [workspaceA, store.id],
    )).rejects.toMatchObject({ code: '23514' });

    await expect(pool.query(
      `INSERT INTO ccos_next_actions (workspace_id, store_id, title)
       VALUES ($1, $2, 'Cross-tenant target')`,
      [workspaceB, store.id],
    )).rejects.toMatchObject({ code: '23503' });
  });

  it('rejects cross-workspace metric targets', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Metric Store' });

    await expect(pool.query(
      `INSERT INTO ccos_metric_snapshots
       (workspace_id, store_id, metric_key, numeric_value, classification, observed_at, source, provenance)
       VALUES ($1, $2, 'views', 1, 'observed', NOW(), 'manual', '{}'::jsonb)`,
      [workspaceB, store.id],
    )).rejects.toMatchObject({ code: '23503' });
  });
});
