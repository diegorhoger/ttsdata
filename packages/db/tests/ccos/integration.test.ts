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

  it('keeps product records tenant-scoped and rejects cross-workspace attachment', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Product Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'affiliate',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Observed Sample',
      priceAmount: '49.900000',
      currency: 'BRL',
      commissionRate: '0.150000',
    });

    await expect(repository.getProduct(workspaceB, product.id)).resolves.toBeNull();
    await expect(repository.updateProduct(workspaceB, product.id, { status: 'selected' })).resolves.toBeNull();
    await expect(repository.listProducts(workspaceB, partnership.id)).resolves.toEqual([]);
    await expect(repository.createProduct({
      workspaceId: workspaceB,
      partnershipId: partnership.id,
      name: 'Cross-tenant sample',
    })).rejects.toMatchObject({ code: '23503' });
  });

  it('persists explicit product transitions and auditable timeline events without fabricating fields', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Logistics Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'gifting',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Gifted Sample',
    });

    expect(product).toMatchObject({
      status: 'proposed',
      priceAmount: null,
      commissionRate: null,
      trackingCode: null,
      shippedAt: null,
      receivedAt: null,
    });
    await expect(repository.updateProduct(workspaceA, product.id, { status: 'content_live' })).rejects.toThrow(
      'Invalid CCOS product transition: proposed -> content_live',
    );

    await repository.updateProduct(workspaceA, product.id, { status: 'selected' });
    await repository.updateProduct(workspaceA, product.id, { status: 'sample_requested' });
    await repository.updateProduct(workspaceA, product.id, { status: 'sample_approved' });
    await repository.updateProduct(workspaceA, product.id, {
      status: 'shipped',
      trackingCode: 'TRACK-123',
      shippedAt: new Date('2026-09-27T12:00:00.000Z'),
    });
    const received = await repository.updateProduct(workspaceA, product.id, {
      status: 'received',
      receivedAt: new Date('2026-09-29T12:00:00.000Z'),
    });
    expect(received).toMatchObject({ status: 'received', trackingCode: 'TRACK-123' });
    expect(received?.receivedAt?.toISOString()).toBe('2026-09-29T12:00:00.000Z');

    const events = await pool.query<{ summary: string }>(
      `SELECT summary FROM ccos_interactions
        WHERE workspace_id = $1 AND partnership_id = $2
          AND direction = 'system' AND channel = 'product_lifecycle'
        ORDER BY occurred_at`,
      [workspaceA, partnership.id],
    );
    expect(events.rows.map(({ summary }) => summary)).toEqual([
      `Product ${product.id} lifecycle changed: proposed -> selected`,
      `Product ${product.id} lifecycle changed: selected -> sample_requested`,
      `Product ${product.id} lifecycle changed: sample_requested -> sample_approved`,
      `Product ${product.id} lifecycle changed: sample_approved -> shipped`,
      `Product ${product.id} lifecycle changed: shipped -> received`,
    ]);
  });

  it('serializes competing product transitions and emits only the committed event', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Product Race Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'paid_campaign',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Race Sample',
    });
    await repository.updateProduct(workspaceA, product.id, { status: 'selected' });
    await repository.updateProduct(workspaceA, product.id, { status: 'sample_requested' });
    await repository.updateProduct(workspaceA, product.id, { status: 'sample_approved' });
    await repository.updateProduct(workspaceA, product.id, { status: 'shipped' });
    await repository.updateProduct(workspaceA, product.id, { status: 'received' });

    const outcomes = await Promise.allSettled([
      repository.updateProduct(workspaceA, product.id, { status: 'content_queue' }),
      repository.updateProduct(workspaceA, product.id, { status: 'replacement_needed' }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const persisted = await repository.getProduct(workspaceA, product.id);
    expect(['content_queue', 'replacement_needed']).toContain(persisted?.status);

    const events = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ccos_interactions
        WHERE workspace_id = $1 AND partnership_id = $2
          AND direction = 'system' AND channel = 'product_lifecycle'`,
      [workspaceA, partnership.id],
    );
    expect(events.rows[0].count).toBe('6');
  });

  it('supports multiple independent content records per product with tenant isolation', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Creative Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'affiliate',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Creative Product',
    });
    const first = await repository.createContent({
      workspaceId: workspaceA,
      productId: product.id,
      platform: 'tiktok',
      format: 'vertical_video',
      concept: 'Hook A',
    });
    const second = await repository.createContent({
      workspaceId: workspaceA,
      productId: product.id,
      platform: 'instagram',
      format: 'reel',
      concept: 'Hook B',
    });

    const listed = await repository.listContents(workspaceA, product.id);
    expect(listed.map(({ id }) => id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(first.id).not.toBe(second.id);
    await expect(repository.getContent(workspaceB, first.id)).resolves.toBeNull();
    await expect(repository.updateContent(workspaceB, first.id, { status: 'planned' })).resolves.toBeNull();
    await expect(repository.createContent({
      workspaceId: workspaceB,
      productId: product.id,
      platform: 'youtube',
    })).rejects.toMatchObject({ code: '23503' });
  });

  it('advances each content independently and audits publication metadata', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Publishing Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'paid_campaign',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Publishing Product',
    });
    const primary = await repository.createContent({
      workspaceId: workspaceA,
      productId: product.id,
      platform: 'tiktok',
      concept: 'Primary hook',
    });
    const variant = await repository.createContent({
      workspaceId: workspaceA,
      productId: product.id,
      platform: 'tiktok',
      concept: 'Variant hook',
    });

    await expect(repository.updateContent(workspaceA, primary.id, { status: 'published' })).rejects.toThrow(
      'Invalid CCOS content transition: idea -> published',
    );
    await repository.updateContent(workspaceA, primary.id, { status: 'planned' });
    await repository.updateContent(workspaceA, primary.id, { status: 'filming' });
    await repository.updateContent(workspaceA, primary.id, { status: 'editing' });
    await repository.updateContent(workspaceA, primary.id, { status: 'ready' });
    await expect(repository.updateContent(workspaceA, primary.id, { status: 'scheduled' })).rejects.toThrow(
      'Invalid CCOS content scheduling: scheduledAt is required',
    );
    await repository.updateContent(workspaceA, primary.id, {
      status: 'scheduled',
      scheduledAt: new Date('2026-10-01T12:00:00.000Z'),
    });
    await expect(repository.updateContent(workspaceA, primary.id, { status: 'published' })).rejects.toThrow(
      'Invalid CCOS content publication: publishedAt and publicationUrl are required',
    );
    const published = await repository.updateContent(workspaceA, primary.id, {
      status: 'published',
      publishedAt: new Date('2026-10-01T13:00:00.000Z'),
      publicationUrl: 'https://www.tiktok.com/@creator/video/123',
    });

    expect(published).toMatchObject({ status: 'published', publicationUrl: 'https://www.tiktok.com/@creator/video/123' });
    await expect(repository.getContent(workspaceA, variant.id)).resolves.toMatchObject({ status: 'idea' });
    const events = await pool.query<{ summary: string }>(
      `SELECT summary FROM ccos_interactions
        WHERE workspace_id = $1 AND partnership_id = $2 AND channel = 'content_lifecycle'
        ORDER BY occurred_at`,
      [workspaceA, partnership.id],
    );
    expect(events.rows).toHaveLength(6);
    expect(events.rows.at(-1)?.summary).toBe(
      `Content ${primary.id} lifecycle changed: scheduled -> published`,
    );
  });

  it('serializes mutually exclusive content transitions', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Content Race Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA,
      storeId: store.id,
      type: 'gifting',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA,
      partnershipId: partnership.id,
      name: 'Content Race Product',
    });
    const content = await repository.createContent({
      workspaceId: workspaceA,
      productId: product.id,
      platform: 'youtube',
    });
    await repository.updateContent(workspaceA, content.id, { status: 'planned' });
    await repository.updateContent(workspaceA, content.id, { status: 'filming' });
    await repository.updateContent(workspaceA, content.id, { status: 'editing' });

    const outcomes = await Promise.allSettled([
      repository.updateContent(workspaceA, content.id, { status: 'filming' }),
      repository.updateContent(workspaceA, content.id, { status: 'ready' }),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const persisted = await repository.getContent(workspaceA, content.id);
    expect(['filming', 'ready']).toContain(persisted?.status);
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
