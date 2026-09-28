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
      `Content ${primary.id} lifecycle changed: scheduled -> published; publication metadata updated`,
    );

    await expect(repository.updateContent(workspaceA, primary.id, {
      publishedAt: null,
      publicationUrl: null,
    })).rejects.toThrow('Invalid CCOS content publication: publishedAt and publicationUrl are required');
    await repository.updateContent(workspaceA, primary.id, {
      publicationUrl: 'https://www.tiktok.com/@creator/video/456',
    });
    const refreshed = await repository.getContent(workspaceA, primary.id);
    expect(refreshed).toMatchObject({
      status: 'published',
      publishedAt: new Date('2026-10-01T13:00:00.000Z'),
      publicationUrl: 'https://www.tiktok.com/@creator/video/456',
    });
    const auditedEdit = await pool.query<{ summary: string }>(
      `SELECT summary FROM ccos_interactions
        WHERE workspace_id = $1 AND partnership_id = $2 AND channel = 'content_lifecycle'
        ORDER BY occurred_at DESC LIMIT 1`,
      [workspaceA, partnership.id],
    );
    expect(auditedEdit.rows[0].summary).toBe(`Content ${primary.id} publication metadata updated`);

    await repository.updateContent(workspaceA, variant.id, { status: 'planned' });
    await repository.updateContent(workspaceA, variant.id, { status: 'filming' });
    await repository.updateContent(workspaceA, variant.id, { status: 'editing' });
    await repository.updateContent(workspaceA, variant.id, { status: 'ready' });
    const variantPublishedAt = new Date('2026-10-02T14:00:00.000Z');
    const variantPublished = await repository.updateContent(workspaceA, variant.id, {
      status: 'published',
      publishedAt: variantPublishedAt,
      publicationUrl: 'https://www.tiktok.com/@creator/video/789',
    });
    expect(variantPublished).toMatchObject({
      publishedAt: variantPublishedAt,
      publicationUrl: 'https://www.tiktok.com/@creator/video/789',
    });
    await expect(repository.getContent(workspaceA, primary.id)).resolves.toMatchObject({
      publishedAt: new Date('2026-10-01T13:00:00.000Z'),
      publicationUrl: 'https://www.tiktok.com/@creator/video/456',
    });
  });

  it('tracks manually entered ad authorization and expiry independently for each creative', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Ad Authorization Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA, storeId: store.id, type: 'paid_campaign',
    });
    const product = await repository.createProduct({
      workspaceId: workspaceA, partnershipId: partnership.id, name: 'Authorization Product',
    });
    const first = await repository.createContent({ workspaceId: workspaceA, productId: product.id, platform: 'tiktok' });
    const second = await repository.createContent({ workspaceId: workspaceA, productId: product.id, platform: 'tiktok' });

    expect(first).toMatchObject({
      adAuthorizationStatus: null, adAuthorizationCode: null,
      adAuthorizationCreatedAt: null, adAuthorizationExpiresAt: null,
    });
    await repository.updateContent(workspaceA, first.id, { adAuthorizationStatus: 'pending' });
    await expect(repository.getContent(workspaceA, second.id)).resolves.toMatchObject({
      adAuthorizationStatus: null, adAuthorizationCode: null,
    });
    await repository.updateContent(workspaceA, second.id, { status: 'planned' });
    await repository.updateContent(workspaceA, second.id, { status: 'filming' });
    await repository.updateContent(workspaceA, second.id, { status: 'editing' });
    await repository.updateContent(workspaceA, second.id, { status: 'ready' });
    await repository.updateContent(workspaceA, second.id, {
      status: 'published',
      publishedAt: new Date('2026-09-28T11:00:00.000Z'),
      publicationUrl: 'https://www.tiktok.com/@creator/video/no-authorization',
    });
    await expect(repository.updateContent(workspaceA, second.id, { status: 'ads_authorized' }))
      .rejects.toThrow('ads_authorized status requires authorized details');
    const pendingActions = await pool.query<{ rule_key: string; status: string; content_id: string }>(
      `SELECT rule_key, status, content_id FROM ccos_next_actions
        WHERE workspace_id = $1 AND content_id = $2 AND rule_key LIKE 'content.ad-auth.%'`,
      [workspaceA, first.id],
    );
    expect(pendingActions.rows).toContainEqual({
      rule_key: 'content.ad-auth.follow-up', status: 'waiting', content_id: first.id,
    });
    await repository.updateContent(workspaceA, first.id, { status: 'planned' });
    const pendingAfterLifecycleChange = await pool.query<{ status: string }>(
      `SELECT status FROM ccos_next_actions
        WHERE workspace_id = $1 AND content_id = $2 AND rule_key = 'content.ad-auth.follow-up'
          AND status IN ('open', 'in_progress', 'waiting')`,
      [workspaceA, first.id],
    );
    expect(pendingAfterLifecycleChange.rows).toEqual([{ status: 'waiting' }]);

    const createdAt = new Date('2026-09-28T12:00:00.000Z');
    const expiresAt = new Date('2026-12-28T12:00:00.000Z');
    const authorized = await repository.updateContent(workspaceA, first.id, {
      adAuthorizationStatus: 'authorized',
      adAuthorizationCode: 'MANUAL-CODE-1',
      adAuthorizationCreatedAt: createdAt,
      adAuthorizationExpiresAt: expiresAt,
    });
    expect(authorized).toMatchObject({
      adAuthorizationStatus: 'authorized', adAuthorizationCode: 'MANUAL-CODE-1',
      adAuthorizationCreatedAt: createdAt, adAuthorizationExpiresAt: expiresAt,
    });
    await repository.updateContent(workspaceA, first.id, {
      status: 'filming',
      adAuthorizationCode: 'MANUAL-CODE-2',
    });
    const combinedAudit = await pool.query<{ summary: string }>(
      `SELECT summary FROM ccos_interactions
        WHERE workspace_id = $1 AND summary LIKE $2 ORDER BY occurred_at DESC LIMIT 1`,
      [workspaceA, `Content ${first.id} lifecycle changed:%`],
    );
    expect(combinedAudit.rows[0].summary).toContain('ad authorization details updated');
    const authorizationActions = await pool.query<{ id: string; rule_key: string; due_at: Date | null; status: string }>(
      `SELECT id, rule_key, due_at, status FROM ccos_next_actions
        WHERE workspace_id = $1 AND content_id = $2 AND rule_key LIKE 'content.ad-auth.%'
          AND status IN ('open', 'in_progress', 'waiting') ORDER BY rule_key`,
      [workspaceA, first.id],
    );
    expect(authorizationActions.rows.map(({ rule_key, due_at, status }) => ({ rule_key, due_at, status }))).toEqual([
      { rule_key: 'content.ad-auth.expiry', due_at: expiresAt, status: 'open' },
      { rule_key: 'content.ad-auth.share', due_at: null, status: 'open' },
    ]);
    const shareAction = authorizationActions.rows.find((row) => row.rule_key === 'content.ad-auth.share')!;
    await expect(repository.updateNextAction(workspaceA, shareAction.id, { status: 'completed' }))
      .rejects.toThrow('resolved only by a target lifecycle transition');
    await expect(repository.updateNextAction(workspaceA, shareAction.id, {
      status: 'completed', resolutionReason: 'Authorization code shared manually',
    })).resolves.toMatchObject({ status: 'completed', resolutionReason: 'Authorization code shared manually' });
    const extendedExpiry = new Date('2027-01-28T12:00:00.000Z');
    await repository.updateContent(workspaceA, first.id, { adAuthorizationExpiresAt: extendedExpiry });
    await repository.updateContent(workspaceA, first.id, { adAuthorizationExpiresAt: extendedExpiry });
    const actionsAfterExpiryEdit = await pool.query<{ rule_key: string; due_at: Date | null; status: string }>(
      `SELECT rule_key, due_at, status FROM ccos_next_actions
        WHERE workspace_id = $1 AND content_id = $2 AND rule_key LIKE 'content.ad-auth.%'
          AND status IN ('open', 'in_progress', 'waiting') ORDER BY rule_key`,
      [workspaceA, first.id],
    );
    expect(actionsAfterExpiryEdit.rows).toEqual([
      { rule_key: 'content.ad-auth.expiry', due_at: extendedExpiry, status: 'open' },
    ]);

    await expect(repository.updateContent(workspaceA, first.id, {
      adAuthorizationExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
    })).rejects.toThrow('Invalid CCOS content ad authorization: expiry must be after creation');
    await repository.updateContent(workspaceA, first.id, {
      adAuthorizationStatus: 'unavailable',
      adAuthorizationCode: null,
      adAuthorizationCreatedAt: null,
      adAuthorizationExpiresAt: null,
    });
    await expect(repository.getContent(workspaceA, first.id)).resolves.toMatchObject({
      adAuthorizationStatus: 'unavailable', adAuthorizationCode: null,
      adAuthorizationCreatedAt: null, adAuthorizationExpiresAt: null,
    });
    const activeActions = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM ccos_next_actions
        WHERE workspace_id = $1 AND content_id = $2 AND rule_key LIKE 'content.ad-auth.%'
          AND status IN ('open', 'in_progress', 'waiting')`,
      [workspaceA, first.id],
    );
    expect(activeActions.rows[0].count).toBe('0');

    await expect(pool.query(
      `UPDATE ccos_contents SET ad_authorization_status = 'pending', ad_authorization_code = 'STALE'
        WHERE workspace_id = $1 AND id = $2`,
      [workspaceA, second.id],
    )).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      `UPDATE ccos_contents SET status = 'ads_authorized'
        WHERE workspace_id = $1 AND id = $2`,
      [workspaceA, second.id],
    )).rejects.toMatchObject({ code: '23514' });
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

  it('creates exactly one active generated action under concurrent duplicate delivery', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Action Race Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA, storeId: store.id, type: 'affiliate',
    });
    const input = {
      workspaceId: workspaceA,
      target: { type: 'partnership' as const, id: partnership.id },
      title: 'Concurrent follow-up',
      generatedAutomatically: true,
      ruleKey: 'test.concurrent',
    };
    const [first, second] = await Promise.all([
      repository.createNextAction(input), repository.createNextAction(input),
    ]);
    expect(first.id).toBe(second.id);
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ccos_next_actions
        WHERE workspace_id = $1 AND dedupe_key = $2 AND status IN ('open','in_progress','waiting')`,
      [workspaceA, `test.concurrent:partnership:${partnership.id}`],
    );
    expect(count.rows[0].count).toBe('1');
  });

  it('synchronizes lifecycle actions, preserves terminal history, and isolates the inbox', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Inbox Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA, storeId: store.id, type: 'inbound_invite',
    });
    const initial = (await repository.listAttentionInbox(workspaceA))
      .find((action) => action.target.type === 'partnership' && action.target.id === partnership.id);
    expect(initial).toMatchObject({ ruleKey: 'partnership.lead.contact', generatedAutomatically: true });

    await repository.updatePartnership(workspaceA, partnership.id, { status: 'contacted' });
    const active = (await repository.listAttentionInbox(workspaceA))
      .filter((action) => action.target.type === 'partnership' && action.target.id === partnership.id);
    expect(active).toHaveLength(1);
    expect(active[0].ruleKey).toBe('partnership.contacted.follow-up');
    await expect(repository.listAttentionInbox(workspaceB)).resolves.not.toContainEqual(
      expect.objectContaining({ id: active[0].id }),
    );
    await expect(repository.updateNextAction(workspaceA, active[0].id, {
      status: 'completed', resolutionReason: 'Follow-up recorded',
    })).rejects.toThrow('Generated CCOS next actions are resolved only by a target lifecycle transition');
    const preserved = await repository.getNextAction(workspaceA, active[0].id);
    expect(preserved).toMatchObject({ status: 'open', completedAt: null });
    await expect(repository.getNextAction(workspaceB, active[0].id)).resolves.toBeNull();

    const manual = await repository.createNextAction({
      workspaceId: workspaceA, target: { type: 'partnership', id: partnership.id }, title: 'Manual audit',
    });
    await repository.updateNextAction(workspaceA, manual.id, {
      status: 'completed', resolutionReason: 'Audit complete',
    });
    await expect(repository.getNextAction(workspaceA, manual.id)).resolves.toMatchObject({
      status: 'completed', resolutionReason: 'Audit complete',
    });
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

  it('allocates immutable template versions concurrently and round-trips JSON variables', async () => {
    const created = await Promise.all(Array.from({ length: 5 }, (_, index) => repository.createTemplateVersion({
      workspaceId: workspaceA, type: 'receipt', subject: `Receipt ${index}`,
      body: 'Hello {{store_name}} about {{product_name}}', variables: ['store_name', 'product_name'],
    })));
    expect(created.map((row) => row.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(created[0].variables).toEqual(['store_name', 'product_name']);
    expect(await repository.getTemplateVersion(workspaceB, created[0].id)).toBeNull();
    expect((await repository.getLatestTemplateVersion(workspaceA, 'receipt'))?.version).toBe(5);
    expect(await repository.listTemplateVersions(workspaceB, 'receipt')).toEqual([]);
    expect(repository.renderTemplate(created[0], { store_name: 'Shop', product_name: 'Serum' }))
      .toEqual({ subject: 'Receipt 0', body: 'Hello Shop about Serum' });
    expect(() => repository.renderTemplate(created[0], { store_name: 'Shop' }))
      .toThrow('Invalid CCOS template render');
    await expect(repository.createTemplateVersion({
      workspaceId: workspaceA, type: 'receipt', subject: 'Broken', body: 'Hello {{name}}', variables: [],
    })).rejects.toThrow('Invalid CCOS template definition');
    await expect(repository.createTemplateVersion({
      workspaceId: workspaceA, type: 'receipt', subject: 'Broken', body: 'Hello {{ name }}', variables: [],
    })).rejects.toThrow('malformed placeholder');
  });

  it('records template usage and validated sources in the partnership timeline atomically', async () => {
    const store = await repository.createStore({ workspaceId: workspaceA, name: 'Timeline Store' });
    const partnership = await repository.createPartnership({
      workspaceId: workspaceA, storeId: store.id, type: 'gifting',
    });
    const product = await repository.createProduct({ workspaceId: workspaceA, partnershipId: partnership.id, name: 'Sample' });
    const content = await repository.createContent({ workspaceId: workspaceA, productId: product.id, platform: 'tiktok' });
    const action = await repository.createNextAction({
      workspaceId: workspaceA, target: { type: 'partnership', id: partnership.id }, title: 'Follow up',
    });
    const template = await repository.createTemplateVersion({
      workspaceId: workspaceA, type: 'sample_confirm', subject: 'Confirmed', body: 'Thank you', variables: [],
    });
    const sourceLinks = [
      { sourceType: 'partnership' as const, sourceId: partnership.id },
      { sourceType: 'product' as const, sourceId: product.id },
      { sourceType: 'content' as const, sourceId: content.id },
      { sourceType: 'action' as const, sourceId: action.id },
      { sourceType: 'template_version' as const, sourceId: template.id },
    ];
    const interaction = await repository.createInteraction({
      workspaceId: workspaceA, partnershipId: partnership.id, direction: 'outbound',
      channel: 'email', summary: 'Sent manually', templateVersionId: template.id, sourceLinks,
    });
    expect(interaction.templateVersionId).toBe(template.id);
    expect((await repository.listTimeline(workspaceA, partnership.id)).find((row) => row.id === interaction.id)?.sources)
      .toEqual(expect.arrayContaining(sourceLinks.map((link) => expect.objectContaining(link))));
    expect(await repository.listTimeline(workspaceB, partnership.id)).toEqual([]);
    expect(await repository.getInteractionSources(workspaceB, interaction.id)).toEqual([]);
    const usage = await pool.query<{ template_version_id: string }>(
      'SELECT template_version_id FROM ccos_template_usage WHERE workspace_id = $1 AND interaction_id = $2',
      [workspaceA, interaction.id],
    );
    expect(usage.rows[0].template_version_id).toBe(template.id);

    const other = await repository.createPartnership({ workspaceId: workspaceA, storeId: store.id, type: 'affiliate' });
    const before = (await repository.listInteractions(workspaceA, partnership.id)).length;
    await expect(repository.createInteraction({
      workspaceId: workspaceA, partnershipId: partnership.id, direction: 'outbound', channel: 'email',
      summary: 'Invalid source', templateVersionId: template.id,
      sourceLinks: [{ sourceType: 'partnership', sourceId: other.id }],
    })).rejects.toThrow('source not found');
    expect(await repository.listInteractions(workspaceA, partnership.id)).toHaveLength(before);

    await expect(repository.createInteraction({
      workspaceId: workspaceB, partnershipId: partnership.id, direction: 'outbound', channel: 'email',
      summary: 'Wrong tenant', templateVersionId: template.id,
    })).rejects.toThrow('partnership not found');
    const storeB = await repository.createStore({ workspaceId: workspaceB, name: 'Other Timeline Store' });
    const partnershipB = await repository.createPartnership({
      workspaceId: workspaceB, storeId: storeB.id, type: 'gifting',
    });
    const interactionB = await repository.createInteraction({
      workspaceId: workspaceB, partnershipId: partnershipB.id, direction: 'inbound',
      channel: 'email', summary: 'Other tenant interaction',
    });
    await expect(pool.query(
      `INSERT INTO ccos_template_usage (workspace_id, template_version_id, interaction_id) VALUES ($1, $2, $3)`,
      [workspaceB, template.id, interactionB.id],
    )).rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(
      `INSERT INTO ccos_interaction_sources (workspace_id, interaction_id, source_type, source_id)
       VALUES ($1, $2, 'product', $3)`,
      [workspaceB, interaction.id, product.id],
    )).rejects.toMatchObject({ code: '23503' });
  });
});
