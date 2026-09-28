import Fastify, {
  type FastifyReply,
  type FastifyRequest,
} from '../../apps/api/node_modules/fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCCOSRoutes, type CCOSRouteOptions } from '../../apps/api/src/routes/ccos';
import { errorHandler } from '../../apps/api/src/lib/errors';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const STORE_ID = '22222222-2222-4222-8222-222222222222';
const PARTNERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
const CONTENT_ID = '66666666-6666-4666-8666-666666666666';
const ACTION_ID = '77777777-7777-4777-8777-777777777777';
const INTERACTION_ID = '88888888-8888-4888-8888-888888888888';
const TEMPLATE_ID = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-09-27T12:00:00.000Z');

const store = {
  id: STORE_ID,
  workspaceId: WORKSPACE_ID,
  name: 'Example Brand',
  contactName: null,
  contactEmail: null,
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const partnership = {
  id: PARTNERSHIP_ID,
  workspaceId: WORKSPACE_ID,
  storeId: STORE_ID,
  type: 'inbound_invite' as const,
  status: 'lead' as const,
  title: null,
  terms: null,
  priority: 'normal' as const,
  lastContactAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const product = {
  id: PRODUCT_ID,
  workspaceId: WORKSPACE_ID,
  partnershipId: PARTNERSHIP_ID,
  name: 'Sample Product',
  sku: null,
  productUrl: null,
  priceAmount: null,
  currency: null,
  commissionRate: null,
  commissionAmount: null,
  stockState: null,
  status: 'proposed' as const,
  trackingCode: null,
  shippedAt: null,
  receivedAt: null,
  priority: 'normal' as const,
  source: 'manual',
  provenance: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const content = {
  id: CONTENT_ID,
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_ID,
  status: 'idea' as const,
  platform: 'instagram',
  format: 'reel',
  concept: 'A product story',
  scheduledAt: null,
  publishedAt: null,
  publicationUrl: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const nextAction = {
  id: ACTION_ID,
  workspaceId: WORKSPACE_ID,
  target: { type: 'product' as const, id: PRODUCT_ID },
  title: 'Request a sample',
  ruleKey: null,
  status: 'open' as const,
  priority: 'normal' as const,
  dueAt: null,
  ownerUserId: null,
  generatedAutomatically: false,
  completedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const interaction = {
  id: INTERACTION_ID,
  workspaceId: WORKSPACE_ID,
  partnershipId: PARTNERSHIP_ID,
  direction: 'outbound' as const,
  channel: 'email',
  summary: 'Sent partnership proposal via email',
  occurredAt: NOW,
  source: 'manual',
  createdAt: NOW,
  templateVersionId: TEMPLATE_ID,
};

const templateVersion = {
  id: TEMPLATE_ID,
  workspaceId: WORKSPACE_ID,
  type: 'invite_first_contact' as const,
  version: 1,
  subject: 'Partnership Proposal',
  body: 'Hi {{partner_name}}, we want to collaborate.',
  variables: ['partner_name', 'product_name'],
  createdAt: NOW,
  updatedAt: NOW,
};

function createRepository() {
  return {
    createStore: vi.fn().mockResolvedValue(store),
    listStores: vi.fn().mockResolvedValue([store]),
    getStore: vi.fn().mockResolvedValue(store),
    updateStore: vi.fn().mockResolvedValue(store),
    createPartnership: vi.fn().mockResolvedValue(partnership),
    listPartnerships: vi.fn().mockResolvedValue([partnership]),
    getPartnership: vi.fn().mockResolvedValue(partnership),
    updatePartnership: vi.fn().mockResolvedValue(partnership),
    createProduct: vi.fn().mockResolvedValue(product),
    listProducts: vi.fn().mockResolvedValue([product]),
    getProduct: vi.fn().mockResolvedValue(product),
    updateProduct: vi.fn().mockResolvedValue(product),
    createContent: vi.fn().mockResolvedValue(content),
    listContents: vi.fn().mockResolvedValue([content]),
    getContent: vi.fn().mockResolvedValue(content),
    updateContent: vi.fn().mockResolvedValue(content),
    createNextAction: vi.fn().mockResolvedValue(nextAction),
    listAttentionInbox: vi.fn().mockResolvedValue([nextAction]),
    getNextAction: vi.fn().mockResolvedValue(nextAction),
    updateNextAction: vi.fn().mockResolvedValue(nextAction),
    createInteraction: vi.fn().mockResolvedValue(interaction),
    listInteractions: vi.fn().mockResolvedValue([interaction]),
    listTimeline: vi.fn().mockResolvedValue([{ ...interaction, sources: [] }]),
    getInteractionSources: vi.fn().mockResolvedValue([]),
    createTemplateVersion: vi.fn().mockResolvedValue(templateVersion),
    getTemplateVersion: vi.fn().mockResolvedValue(templateVersion),
    listTemplateVersions: vi.fn().mockResolvedValue([templateVersion]),
    getLatestTemplateVersion: vi.fn().mockResolvedValue(templateVersion),
    renderTemplate: vi.fn().mockReturnValue({ subject: 'Partnership Proposal', body: 'Hi Brand, we want to collaborate.' }),
  };
}

async function buildApp(
  repository: ReturnType<typeof createRepository>,
  role: 'owner' | 'admin' | 'analyst' | 'viewer' = 'owner',
) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    request.auth = {
      userId: '44444444-4444-4444-8444-444444444444',
      workspaceId: WORKSPACE_ID,
      email: 'creator@example.test',
      role,
      planCode: 'beta',
    };
  };
  await app.register(registerCCOSRoutes, {
    prefix: '/api/ccos',
    repository: repository as CCOSRouteOptions['repository'],
    authenticate,
  });
  return app;
}

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('CCOS store and partnership routes', () => {
  it('derives the tenant from authenticated context when creating a store', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/ccos/stores',
      payload: { name: 'Example Brand' },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.createStore).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: 'Example Brand',
    });
  });

  it('rejects a client-supplied workspace identifier', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/ccos/stores',
      payload: { name: 'Example Brand', workspaceId: 'attacker-workspace' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(repository.createStore).not.toHaveBeenCalled();
  });

  it('allows viewers to read but forbids workspace-wide mutations', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const readResponse = await app.inject({ method: 'GET', url: '/api/ccos/stores' });
    const writeResponse = await app.inject({
      method: 'POST',
      url: '/api/ccos/stores',
      payload: { name: 'Forbidden Brand' },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
    expect(writeResponse.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(repository.createStore).not.toHaveBeenCalled();
  });

  it('fails closed when a store is absent from the authenticated workspace', async () => {
    const repository = createRepository();
    repository.getStore.mockResolvedValueOnce(null);
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: `/api/ccos/stores/${STORE_ID}` });

    expect(response.statusCode).toBe(404);
    expect(repository.getStore).toHaveBeenCalledWith(WORKSPACE_ID, STORE_ID);
  });

  it('rejects malformed entity identifiers before repository access', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const storeResponse = await app.inject({ method: 'GET', url: '/api/ccos/stores/not-a-uuid' });
    const partnershipResponse = await app.inject({
      method: 'PATCH',
      url: '/api/ccos/partnerships/not-a-uuid',
      payload: { status: 'contacted' },
    });

    expect(storeResponse.statusCode).toBe(400);
    expect(partnershipResponse.statusCode).toBe(400);
    expect(repository.getStore).not.toHaveBeenCalled();
    expect(repository.updatePartnership).not.toHaveBeenCalled();
  });

  it('creates a partnership only after a tenant-scoped store lookup', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/stores/${STORE_ID}/partnerships`,
      payload: { type: 'inbound_invite', priority: 'high' },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.getStore).toHaveBeenCalledWith(WORKSPACE_ID, STORE_ID);
    expect(repository.createPartnership).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      storeId: STORE_ID,
      type: 'inbound_invite',
      priority: 'high',
    });
  });

  it('rejects null contact timestamps instead of coercing them to the Unix epoch', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/stores/${STORE_ID}/partnerships`,
      payload: { type: 'inbound_invite', lastContactAt: null },
    });

    expect(response.statusCode).toBe(400);
    expect(repository.createPartnership).not.toHaveBeenCalled();
  });

  it('returns a conflict for an invalid partnership transition', async () => {
    const repository = createRepository();
    repository.updatePartnership.mockRejectedValueOnce(
      new Error('Invalid CCOS partnership transition: lead -> active'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}`,
      payload: { status: 'active' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_TRANSITION' });
    expect(repository.updatePartnership).toHaveBeenCalledWith(
      WORKSPACE_ID,
      PARTNERSHIP_ID,
      { status: 'active' },
    );
  });

  it('creates a product only after a tenant-scoped partnership lookup', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/products`,
      payload: {
        name: 'Sample Product',
        priceAmount: '49.900000',
        currency: 'brl',
        commissionRate: '0.150000',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.getPartnership).toHaveBeenCalledWith(WORKSPACE_ID, PARTNERSHIP_ID);
    expect(repository.createProduct).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      partnershipId: PARTNERSHIP_ID,
      name: 'Sample Product',
      priceAmount: '49.900000',
      currency: 'BRL',
      commissionRate: '0.150000',
    });
  });

  it('does not fabricate unavailable logistics or commercial fields', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/products`,
      payload: { name: 'Unknown logistics' },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.createProduct).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      partnershipId: PARTNERSHIP_ID,
      name: 'Unknown logistics',
    });
  });

  it('rejects decimal values that exceed the database precision before repository access', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const amountResponse = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/products`,
      payload: { name: 'Overflow amount', priceAmount: '100000000000000' },
    });
    const rateResponse = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/products`,
      payload: { name: 'Overflow rate', commissionRate: '1000.000000' },
    });

    expect(amountResponse.statusCode).toBe(400);
    expect(rateResponse.statusCode).toBe(400);
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it('returns a conflict for an invalid product lifecycle shortcut', async () => {
    const repository = createRepository();
    repository.updateProduct.mockRejectedValueOnce(
      new Error('Invalid CCOS product transition: proposed -> content_live'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/ccos/products/${PRODUCT_ID}`,
      payload: { status: 'content_live' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_TRANSITION' });
  });

  it('rejects malformed product IDs and null create timestamps before repository access', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const idResponse = await app.inject({ method: 'GET', url: '/api/ccos/products/not-a-uuid' });
    const timestampResponse = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/products`,
      payload: { name: 'Sample Product', shippedAt: null },
    });

    expect(idResponse.statusCode).toBe(400);
    expect(timestampResponse.statusCode).toBe(400);
    expect(repository.getProduct).not.toHaveBeenCalled();
    expect(repository.createProduct).not.toHaveBeenCalled();
  });

  it('keeps product mutations restricted to owners and admins', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const readResponse = await app.inject({ method: 'GET', url: `/api/ccos/products/${PRODUCT_ID}` });
    const writeResponse = await app.inject({
      method: 'PATCH', url: `/api/ccos/products/${PRODUCT_ID}`, payload: { status: 'selected' },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
    expect(repository.updateProduct).not.toHaveBeenCalled();
  });

  it('creates content only after a tenant-scoped product lookup', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/products/${PRODUCT_ID}/contents`,
      payload: { platform: 'instagram', format: 'reel', concept: 'A product story' },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.getProduct).toHaveBeenCalledWith(WORKSPACE_ID, PRODUCT_ID);
    expect(repository.createContent).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      productId: PRODUCT_ID,
      platform: 'instagram',
      format: 'reel',
      concept: 'A product story',
    });
  });

  it('lists contents with and without a product filter', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const allResponse = await app.inject({ method: 'GET', url: '/api/ccos/contents' });
    const filteredResponse = await app.inject({
      method: 'GET', url: `/api/ccos/contents?productId=${PRODUCT_ID}`,
    });

    expect(allResponse.statusCode).toBe(200);
    expect(filteredResponse.statusCode).toBe(200);
    expect(repository.listContents).toHaveBeenNthCalledWith(1, WORKSPACE_ID, undefined);
    expect(repository.listContents).toHaveBeenNthCalledWith(2, WORKSPACE_ID, PRODUCT_ID);
  });

  it('rejects malformed content UUIDs before repository access', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/ccos/contents/not-a-uuid' });

    expect(response.statusCode).toBe(400);
    expect(repository.getContent).not.toHaveBeenCalled();
  });

  it('allows viewers to read content but forbids content mutations', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const readResponse = await app.inject({ method: 'GET', url: `/api/ccos/contents/${CONTENT_ID}` });
    const writeResponse = await app.inject({
      method: 'PATCH', url: `/api/ccos/contents/${CONTENT_ID}`, payload: { status: 'planned' },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
    expect(repository.updateContent).not.toHaveBeenCalled();
  });

  it('returns a conflict for an invalid content lifecycle transition', async () => {
    const repository = createRepository();
    repository.updateContent.mockRejectedValueOnce(
      new Error('Invalid CCOS content transition: idea -> published'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH', url: `/api/ccos/contents/${CONTENT_ID}`, payload: { status: 'published' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_TRANSITION' });
  });

  it('rejects null create fields and unexpected content payload fields', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const nullFieldResponse = await app.inject({
      method: 'POST', url: `/api/ccos/products/${PRODUCT_ID}/contents`,
      payload: { platform: 'instagram', format: null },
    });
    const extraFieldResponse = await app.inject({
      method: 'POST', url: `/api/ccos/products/${PRODUCT_ID}/contents`,
      payload: { platform: 'instagram', workspaceId: WORKSPACE_ID },
    });

    expect(nullFieldResponse.statusCode).toBe(400);
    expect(extraFieldResponse.statusCode).toBe(400);
    expect(repository.createContent).not.toHaveBeenCalled();
  });

  it('maps missing publication metadata to an invalid-transition conflict', async () => {
    const repository = createRepository();
    repository.updateContent.mockRejectedValueOnce(
      new Error('Invalid CCOS content publication: publishedAt and publicationUrl are required'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH', url: `/api/ccos/contents/${CONTENT_ID}`, payload: { status: 'published' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_TRANSITION' });
  });

  it('delegates publication metadata clears to the persisted-state invariant and returns conflict', async () => {
    const repository = createRepository();
    repository.updateContent.mockRejectedValueOnce(
      new Error('Invalid CCOS content publication: publishedAt and publicationUrl are required'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/ccos/contents/${CONTENT_ID}`,
      payload: { publishedAt: null, publicationUrl: null },
    });

    expect(response.statusCode).toBe(409);
    expect(repository.updateContent).toHaveBeenCalledWith(WORKSPACE_ID, CONTENT_ID, {
      publishedAt: null,
      publicationUrl: null,
    });
  });

  it('lists the authenticated workspace attention inbox', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/ccos/next-actions' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ nextActions: [{
      id: ACTION_ID,
      workspaceId: WORKSPACE_ID,
      target: { type: 'product', id: PRODUCT_ID },
      status: 'open',
    }] });
    expect(repository.listAttentionInbox).toHaveBeenCalledWith(WORKSPACE_ID);
  });

  it('creates a manual next action using the authenticated workspace and target union', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/ccos/next-actions',
      payload: {
        target: { type: 'product', id: PRODUCT_ID },
        title: 'Request a sample',
        priority: 'high',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.createNextAction).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      target: { type: 'product', id: PRODUCT_ID },
      title: 'Request a sample',
      priority: 'high',
      generatedAutomatically: false,
    });
  });

  it('gets and updates a next action with workspace scope', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const readResponse = await app.inject({ method: 'GET', url: `/api/ccos/next-actions/${ACTION_ID}` });
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/ccos/next-actions/${ACTION_ID}`,
      payload: { status: 'completed' },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(updateResponse.statusCode).toBe(200);
    expect(repository.getNextAction).toHaveBeenCalledWith(WORKSPACE_ID, ACTION_ID);
    expect(repository.updateNextAction).toHaveBeenCalledWith(WORKSPACE_ID, ACTION_ID, {
      status: 'completed',
    });
  });

  it('requires owner/admin for next-action writes while viewers can read', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const readResponse = await app.inject({ method: 'GET', url: `/api/ccos/next-actions/${ACTION_ID}` });
    const createResponse = await app.inject({
      method: 'POST', url: '/api/ccos/next-actions',
      payload: { target: { type: 'store', id: STORE_ID }, title: 'Contact the store' },
    });
    const updateResponse = await app.inject({
      method: 'PATCH', url: `/api/ccos/next-actions/${ACTION_ID}`, payload: { status: 'completed' },
    });

    expect(readResponse.statusCode).toBe(200);
    expect(createResponse.statusCode).toBe(403);
    expect(updateResponse.statusCode).toBe(403);
    expect(repository.createNextAction).not.toHaveBeenCalled();
    expect(repository.updateNextAction).not.toHaveBeenCalled();
  });

  it('rejects malformed next-action IDs, targets, and strict payload violations before writes', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const badIdResponse = await app.inject({
      method: 'GET', url: '/api/ccos/next-actions/not-a-uuid',
    });
    const badTargetResponse = await app.inject({
      method: 'POST', url: '/api/ccos/next-actions',
      payload: { target: { type: 'product', id: 'not-a-uuid' }, title: 'Do the work' },
    });
    const extraFieldResponse = await app.inject({
      method: 'POST', url: '/api/ccos/next-actions',
      payload: {
        target: { type: 'product', id: PRODUCT_ID },
        title: 'Do the work', generatedAutomatically: true,
      },
    });

    expect(badIdResponse.statusCode).toBe(400);
    expect(badTargetResponse.statusCode).toBe(400);
    expect(extraFieldResponse.statusCode).toBe(400);
    expect(repository.getNextAction).not.toHaveBeenCalled();
    expect(repository.createNextAction).not.toHaveBeenCalled();
  });

  it('returns conflict when a generated action can only be resolved by lifecycle transition', async () => {
    const repository = createRepository();
    repository.updateNextAction.mockRejectedValueOnce(
      new Error('Generated CCOS next actions are resolved only by a target lifecycle transition'),
    );
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'PATCH', url: `/api/ccos/next-actions/${ACTION_ID}`, payload: { status: 'completed' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'INVALID_TRANSITION' });
  });
});

describe('CCOS interactions and template routes', () => {
  it('requires authentication for interaction and template reads', async () => {
    const repository = createRepository();
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    await app.register(registerCCOSRoutes, {
      prefix: '/api/ccos',
      repository: repository as CCOSRouteOptions['repository'],
      authenticate: async (_request, reply) => reply.status(401).send({ error: 'UNAUTHENTICATED' }),
    });
    apps.push(app);

    const timeline = await app.inject({ method: 'GET', url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/timeline` });
    const suggestions = await app.inject({ method: 'GET', url: '/api/ccos/templates/suggestions/invite_received' });
    const markSent = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/mark-sent`,
      payload: { channel: 'email', summary: 'Sent without authentication.' },
    });

    expect(timeline.statusCode).toBe(401);
    expect(suggestions.statusCode).toBe(401);
    expect(markSent.statusCode).toBe(401);
    expect(repository.listTimeline).not.toHaveBeenCalled();
    expect(repository.getLatestTemplateVersion).not.toHaveBeenCalled();
    expect(repository.createInteraction).not.toHaveBeenCalled();
  });

  it('allows owner/admin to explicitly mark an outbound message as sent', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'admin');
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/mark-sent`,
      payload: {
        channel: 'email',
        summary: 'Sent the approved proposal to the brand.',
        templateVersionId: TEMPLATE_ID,
        sourceLinks: [{ sourceType: 'product', sourceId: PRODUCT_ID }],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.getPartnership).toHaveBeenCalledWith(WORKSPACE_ID, PARTNERSHIP_ID);
    expect(repository.getTemplateVersion).toHaveBeenCalledWith(WORKSPACE_ID, TEMPLATE_ID);
    expect(repository.createInteraction).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      partnershipId: PARTNERSHIP_ID,
      direction: 'outbound',
      channel: 'email',
      summary: 'Sent the approved proposal to the brand.',
      templateVersionId: TEMPLATE_ID,
      sourceLinks: [{ sourceType: 'product', sourceId: PRODUCT_ID }],
    });

    repository.getProduct.mockResolvedValueOnce(null);
    const crossTenantSource = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/mark-sent`,
      payload: {
        channel: 'email',
        summary: 'Do not attach a product from another workspace.',
        sourceLinks: [{ sourceType: 'product', sourceId: PRODUCT_ID }],
      },
    });
    expect(crossTenantSource.statusCode).toBe(404);
    expect(repository.createInteraction).toHaveBeenCalledTimes(1);
  });

  it('forbids viewers from marking messages sent and rejects malformed or extra fields', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/mark-sent`,
      payload: { channel: 'email', summary: 'Sent it.' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(repository.getPartnership).not.toHaveBeenCalled();

    const ownerApp = await buildApp(repository);
    apps.push(ownerApp);
    const extraField = await ownerApp.inject({
      method: 'POST',
      url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/mark-sent`,
      payload: { channel: 'email', summary: 'Sent it.', direction: 'system' },
    });
    const invalidId = await ownerApp.inject({
      method: 'POST',
      url: '/api/ccos/partnerships/not-a-uuid/mark-sent',
      payload: { channel: 'email', summary: 'Sent it.' },
    });

    expect(extraField.statusCode).toBe(400);
    expect(invalidId.statusCode).toBe(400);
    expect(repository.createInteraction).not.toHaveBeenCalled();
  });

  it('rejects client-created system and outbound interactions on the generic route', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const system = await app.inject({
      method: 'POST',
      url: '/api/ccos/interactions',
      payload: { partnershipId: PARTNERSHIP_ID, direction: 'system', channel: 'email', summary: 'Forged event' },
    });
    const outbound = await app.inject({
      method: 'POST',
      url: '/api/ccos/interactions',
      payload: { partnershipId: PARTNERSHIP_ID, direction: 'outbound', channel: 'email', summary: 'Bypass mark-sent' },
    });

    expect(system.statusCode).toBe(400);
    expect(outbound.statusCode).toBe(400);
    expect(repository.createInteraction).not.toHaveBeenCalled();
  });

  it('records inbound interactions only after tenant-scoped partnership and template lookups', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/ccos/interactions',
      payload: {
        partnershipId: PARTNERSHIP_ID,
        direction: 'inbound',
        channel: 'email',
        summary: 'Received a proposal.',
        templateVersionId: TEMPLATE_ID,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(repository.getPartnership).toHaveBeenCalledWith(WORKSPACE_ID, PARTNERSHIP_ID);
    expect(repository.getTemplateVersion).toHaveBeenCalledWith(WORKSPACE_ID, TEMPLATE_ID);
    expect(repository.createInteraction).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      partnershipId: PARTNERSHIP_ID,
      direction: 'inbound',
      channel: 'email',
      summary: 'Received a proposal.',
      templateVersionId: TEMPLATE_ID,
      occurredAt: undefined,
      sourceLinks: undefined,
    });

    repository.getPartnership.mockResolvedValueOnce(null);
    const crossTenant = await app.inject({
      method: 'POST',
      url: '/api/ccos/interactions',
      payload: {
        partnershipId: PARTNERSHIP_ID,
        direction: 'inbound',
        channel: 'email',
        summary: 'Attempt against another workspace.',
      },
    });
    expect(crossTenant.statusCode).toBe(404);
    expect(repository.createInteraction).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a cross-tenant partnership before listing its timeline', async () => {
    const repository = createRepository();
    repository.getPartnership.mockResolvedValueOnce(null);
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: `/api/ccos/partnerships/${PARTNERSHIP_ID}/timeline` });

    expect(response.statusCode).toBe(404);
    expect(repository.getPartnership).toHaveBeenCalledWith(WORKSPACE_ID, PARTNERSHIP_ID);
    expect(repository.listTimeline).not.toHaveBeenCalled();
  });

  it('returns lifecycle template suggestions by tenant without creating interactions', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/ccos/templates/suggestions/product_received' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ event: 'product_received', templateVersion: { id: TEMPLATE_ID } });
    expect(repository.getLatestTemplateVersion).toHaveBeenCalledWith(WORKSPACE_ID, 'receipt');
    expect(repository.createInteraction).not.toHaveBeenCalled();
  });

  it('rejects invalid suggestion events and returns null when no lifecycle template exists', async () => {
    const repository = createRepository();
    repository.getLatestTemplateVersion.mockResolvedValueOnce(null);
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const missing = await app.inject({ method: 'GET', url: '/api/ccos/templates/suggestions/replenishment_due' });
    const invalid = await app.inject({ method: 'GET', url: '/api/ccos/templates/suggestions/send_email_now' });

    expect(missing.statusCode).toBe(200);
    expect(missing.json()).toEqual({ event: 'replenishment_due', templateVersion: null });
    expect(invalid.statusCode).toBe(400);
    expect(repository.getLatestTemplateVersion).toHaveBeenCalledWith(WORKSPACE_ID, 'followup_performance');
    expect(repository.createInteraction).not.toHaveBeenCalled();
  });

  it('rejects template definitions whose declared variables differ from their placeholders', async () => {
    const repository = createRepository();
    const app = await buildApp(repository);
    apps.push(app);

    const undeclared = await app.inject({
      method: 'POST', url: '/api/ccos/templates',
      payload: { type: 'receipt', subject: 'Hello', body: 'Hi {{name}}', variables: [] },
    });
    const unused = await app.inject({
      method: 'POST', url: '/api/ccos/templates',
      payload: { type: 'receipt', subject: 'Hello', body: 'Hi', variables: ['name'] },
    });
    const malformed = await app.inject({
      method: 'POST', url: '/api/ccos/templates',
      payload: { type: 'receipt', subject: 'Hello', body: 'Hi {{name-with-hyphen}}', variables: [] },
    });

    expect(undeclared.statusCode).toBe(400);
    expect(unused.statusCode).toBe(400);
    expect(malformed.statusCode).toBe(400);
    expect(repository.createTemplateVersion).not.toHaveBeenCalled();
  });

  it('rejects missing and extra render variables before rendering', async () => {
    const repository = createRepository();
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const missing = await app.inject({
      method: 'POST', url: `/api/ccos/templates/${TEMPLATE_ID}/render`, payload: { partner_name: 'Brand' },
    });
    const extra = await app.inject({
      method: 'POST',
      url: `/api/ccos/templates/${TEMPLATE_ID}/render`,
      payload: { partner_name: 'Brand', product_name: 'Serum', unexpected: 'value' },
    });

    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: 'VALIDATION_ERROR', details: { missing: ['product_name'] } });
    expect(extra.statusCode).toBe(400);
    expect(extra.json()).toMatchObject({ error: 'VALIDATION_ERROR', details: { extra: ['unexpected'] } });
    expect(repository.renderTemplate).not.toHaveBeenCalled();
  });

  it('maps repository template-render validation failures to 400', async () => {
    const repository = createRepository();
    repository.renderTemplate.mockImplementationOnce(() => {
      throw new Error('Invalid CCOS template render: unresolved placeholder');
    });
    const app = await buildApp(repository, 'viewer');
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/ccos/templates/${TEMPLATE_ID}/render`,
      payload: { partner_name: 'Brand', product_name: 'Serum' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(repository.renderTemplate).toHaveBeenCalledWith(templateVersion, {
      partner_name: 'Brand', product_name: 'Serum',
    });
  });
});
