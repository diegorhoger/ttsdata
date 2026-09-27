import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CCOSRepository } from '../../src/repositories/ccos';

const DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('CCOS integration tests require TEST_DATABASE_URL');
}

if (!new URL(DATABASE_URL).pathname.slice(1).endsWith('_test')) {
  throw new Error('CCOS integration tests require a database name ending in _test');
}

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
    // Delete users first (they reference workspaces via foreign key)
    const workspaceIds = [workspaceA, workspaceB].filter(Boolean);
    if (workspaceIds.length > 0) {
      await pool.query('DELETE FROM users WHERE workspace_id = ANY($1::uuid[])', [workspaceIds]);
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [workspaceIds]);
    }
    await pool.end();
  });

  it('fails closed when another workspace reads a store', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Tenant A Store' });

    await expect(repository.getStore(workspaceA, store.id)).resolves.toMatchObject({ name: 'Tenant A Store' });
    await expect(repository.getStore(workspaceB, store.id)).resolves.toBeNull();
  });

  it('lists and updates stores only inside the authenticated workspace', async () => {
    const storeA = await repository.createStore({ workspaceId: workspaceA, name: 'Alpha Store' });
    await repository.createStore({ workspaceId: workspaceB, name: 'Hidden Store' });

    const listed = await repository.listStores(workspaceA);
    expect(listed.map((store) => store.name)).toContain('Alpha Store');
    expect(listed.map((store) => store.name)).not.toContain('Hidden Store');

    await expect(repository.updateStore(workspaceB, storeA.id, { name: 'Hijacked' })).resolves.toBeNull();
    await expect(repository.updateStore(workspaceA, storeA.id, {
      contactName: 'Creator Team',
      contactEmail: 'creator@example.test',
    })).resolves.toMatchObject({
      name: 'Alpha Store',
      contactName: 'Creator Team',
      contactEmail: 'creator@example.test',
    });
  });

  it('rejects cross-workspace relationship writes at the database boundary', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Protected Store' });

    await expect(repository.createPartnership({
      workspaceId: workspaceB,
      storeId: store.id,
      type: 'inbound_invite',
    })).rejects.toMatchObject({ code: '23503' });
  });

  it('keeps partnership CRUD tenant-scoped and rejects invalid lifecycle shortcuts', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Lifecycle Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'inbound_invite',
      title: 'Launch collaboration',
    });

    await expect(repository.getPartnership(workspaceB, partnership.id)).resolves.toBeNull();
    await expect(repository.updatePartnership(workspaceB, partnership.id, { status: 'contacted' })).resolves.toBeNull();
    await expect(repository.updatePartnership(workspaceA, partnership.id, { status: 'active' })).rejects.toThrow(
      'Invalid CCOS partnership transition: lead -> active',
    );

    await repository.updatePartnership(workspaceA, partnership.id, { status: 'contacted' });
    await expect(repository.updatePartnership(workspaceA, partnership.id, {
      status: 'negotiating',
      priority: 'high',
    })).resolves.toMatchObject({ status: 'negotiating', priority: 'high' });
  });

  it('serializes competing partnership transitions against the locked current status', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Concurrent Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'paid_campaign',
    });
    await repository.updatePartnership(workspaceA, partnership.id, { status: 'contacted' });
    await repository.updatePartnership(workspaceA, partnership.id, { status: 'negotiating' });

    const outcomes = await Promise.allSettled([
      repository.updatePartnership(workspaceA, partnership.id, { status: 'active' }),
      repository.updatePartnership(workspaceA, partnership.id, { status: 'declined' }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
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
