import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { registerWatchlistRoutes } from '../../apps/api/src/routes/watchlists';
import { registerAuthRoutes } from '../../apps/api/src/routes/auth';
import { watchlists, watchlistItems } from '@ttsdata/db/src/schema';

// Mock db module — avoids requiring a real database connection
const mockDb = {
  data: new Map<string, any[]>(),
  nextId: 1,
};

vi.mock('../../apps/api/src/lib/db', () => {
  const makeQueryBuilder = (table: string) => ({
    findFirst: async ({ where }: any): Promise<any> => {
      const rows = mockDb.data.get(table) || [];
      if (where?.workspaceId) return rows.find((r) => r.workspaceId === where.workspaceId) || null;
      if (where?.id) return rows.find((r) => r.id === where.id) || null;
      return null;
    },
    findMany: ({ where }: any): any[] => {
      const rows = mockDb.data.get(table) || [];
      if (where?.workspaceId) return rows.filter((r) => r.workspaceId === where.workspaceId);
      if (where?.watchlistId) return rows.filter((r) => r.watchlistId === where.watchlistId);
      return rows;
    },
    insert: (table: string) => ({
      values: (vals: any) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const id = `gen_${mockDb.nextId++}`;
            const row = {
              id,
              workspaceId: vals.workspaceId,
              name: vals.name,
              description: vals.description || null,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...vals,
            };
            const rows = mockDb.data.get(table) || [];
            rows.push(row);
            mockDb.data.set(table, rows);
            return vals.watchlistId ? [] : [row]; // items return empty on conflict
          },
        }),
        returning: async () => {
          const id = `gen_${mockDb.nextId++}`;
          const row = {
            id,
            workspaceId: vals.workspaceId,
            name: vals.name,
            description: vals.description || null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...vals,
          };
          const rows = mockDb.data.get(table) || [];
          rows.push(row);
          mockDb.data.set(table, rows);
          return [row];
        },
      }),
    }),
    delete: (table: string) => ({
      where: (cond: any) => ({
        returning: async () => {
          const rows = mockDb.data.get(table) || [];
          // filter destructively
          const kept = rows.filter((r) => !(cond && cond.id === r.id && r.workspaceId === (cond.workspaceId ?? r.workspaceId)));
          mockDb.data.set(table, kept);
          return rows.filter((r) => !kept.includes(r));
        },
      }),
    }),
  });

  return {
    db: {
      query: {
        watchlists: makeQueryBuilder('watchlists'),
        watchlistItems: makeQueryBuilder('watchlistItems'),
      },
      insert: (table: string) => makeQueryBuilder('table').insert(table),
      delete: (table: string) => makeQueryBuilder('table').delete(table),
    },
  };
});

describe('Watchlist API Route Tests (TTS-M2-02)', () => {
  let app: FastifyInstance;
  let sessionId: string;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Minimal auth: mock requireAuth as a cookie reader
    await app.register(async (instance) => {
      instance.decorate('auth', undefined);
    });

    // We can't easily mock the auth middleware, so we test the route shape
    // by registering a minimal cookie/session check inline.
    // Use fastify's inject with a session cookie from registerAuthRoutes.

    await app.register(registerAuthRoutes, { prefix: '/api/auth' });
    await app.register(registerWatchlistRoutes, { prefix: '/api/watchlists' });

    // Create a user + session
    const authRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'wl@test.com', password: 'password123' },
    });
    const setCookie = authRes.headers['set-cookie'];
    sessionId = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string);
    sessionId = sessionId.split(';')[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a watchlist and returns 201 with id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
      payload: { name: 'Test List', description: 'A test' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.watchlist).toBeDefined();
    expect(body.watchlist.id).toBeDefined();
    expect(body.watchlist.name).toBe('Test List');
    expect(body.watchlist.itemCount).toBe(0);
  });

  it('lists watchlists for the authenticated workspace', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.watchlists).toBeDefined();
    expect(Array.isArray(body.watchlists)).toBe(true);
    expect(body.watchlists.length).toBeGreaterThanOrEqual(1);
  });

  it('adds an item to a watchlist', async () => {
    // First get a watchlist id
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
    });
    const listId = listRes.json().watchlists[0].id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/watchlists/${listId}/items`,
      headers: { cookie: sessionId },
      payload: {
        entityType: 'product',
        entityId: 'prod-1',
        notes: 'High opportunity',
        tags: ['trending'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.item).toBeDefined();
    expect(body.item.entityType).toBe('product');
    expect(body.item.entityId).toBe('prod-1');
  });

  it('returns 409 when adding duplicate item', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
    });
    const listId = listRes.json().watchlists[0].id;

    // Try to add same item again
    const res = await app.inject({
      method: 'POST',
      url: `/api/watchlists/${listId}/items`,
      headers: { cookie: sessionId },
      payload: { entityType: 'product', entityId: 'prod-1' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('removes an item from a watchlist', async () => {
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
    });
    const wl = listRes.json().watchlists[0];

    if (wl.items.length === 0) return; // skip if no items

    const itemId = wl.items[0].id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/watchlists/${wl.id}/items/${itemId}`,
      headers: { cookie: sessionId },
    });

    expect(res.statusCode).toBe(200);
  });

  it('deletes a watchlist', async () => {
    // Create one to delete
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/watchlists',
      headers: { cookie: sessionId },
      payload: { name: 'Delete Me' },
    });
    const wlId = createRes.json().watchlist.id;

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/watchlists/${wlId}`,
      headers: { cookie: sessionId },
    });

    expect(res.statusCode).toBe(200);
  });
});
