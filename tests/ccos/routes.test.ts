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
  };
}

async function buildApp(repository: ReturnType<typeof createRepository>) {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply) => {
    request.auth = {
      userId: '44444444-4444-4444-8444-444444444444',
      workspaceId: WORKSPACE_ID,
      email: 'creator@example.test',
      role: 'owner',
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

  it('fails closed when a store is absent from the authenticated workspace', async () => {
    const repository = createRepository();
    repository.getStore.mockResolvedValueOnce(null);
    const app = await buildApp(repository);
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: `/api/ccos/stores/${STORE_ID}` });

    expect(response.statusCode).toBe(404);
    expect(repository.getStore).toHaveBeenCalledWith(WORKSPACE_ID, STORE_ID);
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
});
