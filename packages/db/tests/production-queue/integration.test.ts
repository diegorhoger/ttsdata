import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CCOSProductionQueueRepository, ProductionQueueConflict, ProductionQueueValidationError } from '../../src/repositories/production-queue';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.slice(1).endsWith('_test')) throw new Error('Queue integration tests require a database ending in _test');

describe('Production queue PostgreSQL isolation, constraints and atomic reorder', () => {
  const pool = new Pool({ connectionString: url });
  const repository = new CCOSProductionQueueRepository(pool);
  let a: string; let b: string; let actorA: string; let actorB: string;
  let productA: string; let productA2: string; let hidden: string; let ineligible: string;

  beforeAll(async () => {
    [a, b] = (await pool.query("INSERT INTO workspaces(name) VALUES ('Queue A'), ('Queue B') RETURNING id")).rows.map((row) => row.id);
    const setup = async (workspaceId: string) => {
      const actor = (await pool.query("INSERT INTO users(workspace_id,email,password_hash) VALUES ($1,$2,'test-only') RETURNING id", [workspaceId, `queue-${workspaceId}@example.test`])).rows[0].id;
      const store = (await pool.query("INSERT INTO ccos_stores(workspace_id,name) VALUES ($1,'Queue store') RETURNING id", [workspaceId])).rows[0].id;
      const partnership = (await pool.query("INSERT INTO ccos_partnerships(workspace_id,store_id,type) VALUES ($1,$2,'affiliate') RETURNING id", [workspaceId, store])).rows[0].id;
      const products = (await pool.query(`INSERT INTO ccos_products(workspace_id,partnership_id,name,status,commission_rate)
        VALUES ($1,$2,'Missing','received',NULL), ($1,$2,'Zero','content_queue',0), ($1,$2,'Started','in_production',50) RETURNING id`, [workspaceId, partnership])).rows.map((row) => row.id);
      return { actor, products };
    };
    const first = await setup(a); const second = await setup(b);
    actorA = first.actor; actorB = second.actor;
    [productA, productA2, ineligible] = first.products; hidden = second.products[0];
  });
  afterAll(async () => {
    const ids = [a, b].filter(Boolean);
    if (ids.length) {
      await pool.query('DELETE FROM ccos_production_queue_audit WHERE workspace_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM users WHERE workspace_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [ids]);
    }
    await pool.end();
  });

  it('includes only eligible tenant products, preserves null vs zero and does not mutate lifecycle', async () => {
    const queue = await repository.getProductionQueue(a, { sort: 'commission' });
    expect(queue.items.map((item) => item.id)).toEqual([productA2, productA]);
    expect(queue.items[0].components.commission.score).toBe(0);
    expect(queue.items[1].components.commission.score).toBeNull();
    expect(queue.eligibleIds).not.toContain(hidden); expect(queue.eligibleIds).not.toContain(ineligible);
    expect(queue.items.map((item) => item.status).sort()).toEqual(['content_queue', 'received']);
    expect(queue.revision).toBe(0); expect(await repository.listProductionQueueAudit(a)).toEqual([]);
  });
  it('rejects cross-tenant actors at repository and database boundaries', async () => {
    const queue = await repository.getProductionQueue(a);
    await expect(repository.reorderProductionQueue(a, actorB, { expectedRevision: queue.revision,
      membershipToken: queue.membershipToken, productIds: queue.eligibleIds, reason: 'Cross tenant' })).rejects.toBeInstanceOf(ProductionQueueValidationError);
    await expect(pool.query(`INSERT INTO ccos_production_queue_audit(workspace_id,revision,actor_user_id,previous_order,new_order,reason)
      VALUES ($1,999,$2,'[]','[]','Cross tenant')`, [a, actorB])).rejects.toMatchObject({ code: '23503' });
  });
  it('rejects foreign, ineligible, duplicate and partial orders without persisting audit/state', async () => {
    for (const productIds of [[productA, hidden], [productA, ineligible], [productA, productA], [productA]]) {
      const queue = await repository.getProductionQueue(a);
      await expect(repository.reorderProductionQueue(a, actorA, { expectedRevision: queue.revision,
        membershipToken: queue.membershipToken, productIds, reason: 'Invalid order' })).rejects.toBeInstanceOf(ProductionQueueValidationError);
    }
    expect((await repository.getProductionQueue(a)).revision).toBe(0);
    expect(await repository.listProductionQueueAudit(a)).toEqual([]);
  });
  it('serializes competing CAS updates, persists exactly one audit and rejects stale retries', async () => {
    const before = await repository.getProductionQueue(a);
    const input = { expectedRevision: before.revision, membershipToken: before.membershipToken,
      productIds: [productA, productA2], reason: 'Commercial launch' };
    const outcomes = await Promise.allSettled([repository.reorderProductionQueue(a, actorA, input), repository.reorderProductionQueue(a, actorA, input)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ProductionQueueConflict);
    const after = await repository.getProductionQueue(a);
    expect(after.revision).toBe(1); expect(after.items.map((item) => item.id)).toEqual([productA, productA2]);
    const audit = await repository.listProductionQueueAudit(a);
    expect(audit).toHaveLength(1); expect(audit[0]).toMatchObject({ revision: 1, actor_user_id: actorA, new_order: input.productIds, reason: input.reason });
    expect(await repository.listProductionQueueAudit(b)).toEqual([]);
    await expect(repository.reorderProductionQueue(a, actorA, input)).rejects.toBeInstanceOf(ProductionQueueConflict);
  });
  it('detects eligible lifecycle membership changes, prunes departed products and leaves statuses untouched', async () => {
    const before = await repository.getProductionQueue(a);
    await pool.query("UPDATE ccos_products SET status = 'in_production' WHERE workspace_id = $1 AND id = $2", [a, productA2]);
    await expect(repository.reorderProductionQueue(a, actorA, { expectedRevision: before.revision,
      membershipToken: before.membershipToken, productIds: before.eligibleIds, reason: 'Stale membership' })).rejects.toBeInstanceOf(ProductionQueueConflict);
    const after = await repository.getProductionQueue(a);
    expect(after.items.map((item) => item.id)).toEqual([productA]);
    expect((await pool.query('SELECT status FROM ccos_products WHERE workspace_id = $1 AND id = $2', [a, productA2])).rows[0].status).toBe('in_production');
  });
  it('enforces state and audit CHECK constraints', async () => {
    await expect(pool.query('UPDATE ccos_production_queue_state SET revision = -1 WHERE workspace_id = $1', [a])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query("UPDATE ccos_production_queue_state SET product_ids = '{}' WHERE workspace_id = $1", [a])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`INSERT INTO ccos_production_queue_audit(workspace_id,revision,actor_user_id,previous_order,new_order,reason)
      VALUES ($1,100,$2,'{}','[]','Valid reason')`, [a, actorA])).rejects.toMatchObject({ code: '23514' });
  });
});
