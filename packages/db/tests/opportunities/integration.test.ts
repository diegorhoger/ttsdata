import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { CCOSOpportunityRepository } from '../../src/repositories/opportunities';
import { CCOSRepository } from '../../src/repositories/ccos';
import { OPPORTUNITY_ACTIONS, OpportunityConflict, OpportunityNotFound, OpportunityValidationError } from '../../src/ccos/opportunities';

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.slice(1).endsWith('_test')) throw new Error('Opportunity integration tests require a database ending in _test');

describe('Opportunity PostgreSQL isolation, audit and human review', () => {
  const pool = new Pool({ connectionString: url });
  const repository = new CCOSOpportunityRepository(pool);
  const lifecycle = new CCOSRepository(pool);
  let a: string; let b: string; let actor: string; let foreignActor: string; let partnership: string; let hidden: string; let product: string;
  beforeAll(async () => {
    [a, b] = (await pool.query("INSERT INTO workspaces(name) VALUES ('Opportunity A'), ('Opportunity B') RETURNING id")).rows.map((row) => row.id);
    const setup = async (workspaceId: string) => {
      const user = (await pool.query("INSERT INTO users(workspace_id,email,password_hash) VALUES ($1,$2,'test-only') RETURNING id", [workspaceId, `opportunity-${workspaceId}@example.test`])).rows[0].id;
      const store = await lifecycle.createStore({ workspaceId, name: 'Opportunity store' });
      const partner = await lifecycle.createPartnership({ workspaceId, storeId: store.id, type: 'affiliate' });
      const item = await lifecycle.createProduct({ workspaceId, partnershipId: partner.id, name: 'Opportunity product' });
      return { user, partner: partner.id, item: item.id };
    };
    const first = await setup(a); const second = await setup(b);
    actor = first.user; partnership = first.partner; product = first.item; foreignActor = second.user; hidden = second.partner;
  });
  afterAll(async () => {
    // Parent workspace deletion is the sole permitted deletion of append-only history.
    const ids = [a, b].filter(Boolean);
    if (ids.length) await pool.query('DELETE FROM workspaces WHERE id = ANY($1::uuid[])', [ids]);
    await pool.end();
  });
  const evidence = { classification: 'self-reported', note: 'Operator reviewed campaign history' };
  it('defaults to UNASSESSED without mutating existing lifecycle or assessment', async () => {
    expect(await repository.getOpportunity(a, partnership)).toMatchObject({ state: 'UNASSESSED', revision: 0, policy: { automatedSuggestions: false } });
    expect(await repository.listHistory(a, partnership)).toEqual([]);
    expect((await lifecycle.getPartnership(a, partnership))?.status).toBe('lead');
  });
  it('fails closed for foreign targets and actors with no partial state/audit', async () => {
    const input = { expectedRevision: 0, state: 'TESTING' as const, reason: 'Initial test', evidence };
    expect(await repository.getOpportunity(a, hidden)).toBeNull();
    await expect(repository.changeState(a, hidden, actor, input)).rejects.toBeInstanceOf(OpportunityNotFound);
    await expect(repository.changeState(a, partnership, foreignActor, input)).rejects.toBeInstanceOf(OpportunityValidationError);
    expect((await repository.getOpportunity(a, partnership))?.revision).toBe(0);
    await expect(pool.query('INSERT INTO ccos_opportunity_states(workspace_id,partnership_id) VALUES ($1,$2)', [a, hidden])).rejects.toMatchObject({ code: '23503' });
  });
  it('serializes CAS decisions and persists the exact actor/reason/evidence', async () => {
    const input = { expectedRevision: 0, state: 'TESTING' as const, reason: 'Initial test', evidence };
    const outcomes = await Promise.allSettled([repository.changeState(a, partnership, actor, input), repository.changeState(a, partnership, actor, input)]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect((outcomes.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(OpportunityConflict);
    const history = await repository.listHistory(a, partnership);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ actor_user_id: actor, previous_state: 'UNASSESSED', new_state: 'TESTING', reason: input.reason, evidence, policy_version: 'manual-v1', revision: 1 });
    expect(await repository.listHistory(b, partnership)).toEqual([]);
    await expect(pool.query("UPDATE ccos_opportunity_history SET reason = 'rewritten' WHERE id = $1", [history[0].id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('DELETE FROM ccos_opportunity_history WHERE id = $1', [history[0].id])).rejects.toMatchObject({ code: '23514' });
  });
  it('creates every reviewed action in the existing inbox with immutable evidence and no merchant contact', async () => {
    const interactionsBefore = await lifecycle.listInteractions(a, partnership);
    for (const kind of OPPORTUNITY_ACTIONS) {
      const result = await repository.createAction(a, partnership, actor, { kind, title: `Review ${kind}`, reason: 'Human approval', evidence });
      expect(result.action).toMatchObject({ partnership_id: partnership, workspace_id: a, generated_automatically: false, status: 'open', owner_user_id: actor });
      expect(result.history).toMatchObject({ action_kind: kind, action_id: result.action.id, previous_state: 'TESTING', new_state: 'TESTING', actor_user_id: actor });
      expect((await lifecycle.listAttentionInbox(a)).some((action) => action.id === result.action.id)).toBe(true);
    }
    expect(await lifecycle.listInteractions(a, partnership)).toEqual(interactionsBefore);
    expect((await lifecycle.getPartnership(a, partnership))?.status).toBe('lead');
    expect((await repository.getOpportunity(a, partnership))?.state).toBe('TESTING');
  });
  it('does not complete or assess a relationship when content is published', async () => {
    const before = await repository.getOpportunity(a, partnership);
    const historyBefore = await repository.listHistory(a, partnership);
    const content = await lifecycle.createContent({ workspaceId: a, productId: product, platform: 'tiktok' });
    for (const status of ['planned', 'filming', 'editing', 'ready'] as const) await lifecycle.updateContent(a, content.id, { status });
    await lifecycle.updateContent(a, content.id, { status: 'published', publishedAt: new Date(), publicationUrl: 'https://www.tiktok.com/@operator/video/1' });
    expect((await lifecycle.getPartnership(a, partnership))?.status).toBe('lead');
    expect((await lifecycle.getProduct(a, product))?.status).toBe('proposed');
    expect(await repository.getOpportunity(a, partnership)).toEqual(before);
    expect(await repository.listHistory(a, partnership)).toEqual(historyBefore);
  });
  it('enforces database actor/tenant/shape integrity and rolls back a failing action audit', async () => {
    await expect(pool.query(`INSERT INTO ccos_opportunity_history(workspace_id,partnership_id,actor_user_id,revision,previous_state,new_state,reason,evidence)
      VALUES ($1,$2,$3,99,'TESTING','PROMISING','Manual review','{"note":"evidence"}')`, [a, partnership, foreignActor])).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(`INSERT INTO ccos_opportunity_history(workspace_id,partnership_id,actor_user_id,revision,previous_state,new_state,reason,evidence)
      VALUES ($1,$2,$3,99,'TESTING','PROMISING','Manual review','{}')`, [a, partnership, actor])).rejects.toMatchObject({ code: '23514' });
    const before = await repository.getOpportunity(a, partnership);
    const actionsBefore = await lifecycle.listAttentionInbox(a);
    // Force a late audit uniqueness failure after action creation and state revision increment.
    await pool.query(`INSERT INTO ccos_opportunity_history(workspace_id,partnership_id,actor_user_id,revision,previous_state,new_state,reason,evidence)
      VALUES ($1,$2,$3,$4,'TESTING','PROMISING','Reserved revision','{"note":"rollback injection"}')`, [a, partnership, actor, before!.revision + 1]);
    await expect(repository.createAction(a, partnership, actor, { kind: 'expansion', title: 'Rollback task', reason: 'Human review', evidence })).rejects.toMatchObject({ code: '23505' });
    expect(await repository.getOpportunity(a, partnership)).toEqual(before);
    expect(await lifecycle.listAttentionInbox(a)).toEqual(actionsBefore);
  });
});
