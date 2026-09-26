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
    await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [[workspaceA, workspaceB]]);
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
});
