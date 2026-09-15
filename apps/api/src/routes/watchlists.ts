/**
 * Watchlists API — TTS-M2-02
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { watchlists, watchlistItems } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

const createWatchlistSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const addItemSchema = z.object({
  entityType: z.enum(['product', 'creator', 'shop', 'video']),
  entityId: z.string().min(1).max(64),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export async function registerWatchlistRoutes(app: FastifyInstance) {

  // GET /api/watchlists — List user's watchlists
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    const lists = await db.query.watchlists.findMany({
      where: eq(watchlists.workspaceId, auth.workspaceId),
      orderBy: desc(watchlists.createdAt),
    });

    // Fetch items for each watchlist
    const listsWithItems = await Promise.all(
      lists.map(async (wl) => {
        const items = await db.query.watchlistItems.findMany({
          where: eq(watchlistItems.watchlistId, wl.id),
        });
        return {
          ...wl,
          items,
        };
      })
    );

    return reply.send({
      watchlists: listsWithItems.map((wl) => ({
        id: wl.id,
        name: wl.name,
        description: wl.description,
        itemCount: wl.items?.length || 0,
        createdAt: wl.createdAt,
        items: (wl.items || []).map((item: any) => ({
          id: item.id,
          entityType: item.entityType,
          entityId: item.entityId,
          notes: item.notes,
          tags: item.tags,
        })),
      })),
    });
  });

  // POST /api/watchlists — Create watchlist
  app.post('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const body = createWatchlistSchema.parse(request.body);

    const [result] = await db.insert(watchlists).values({
      workspaceId: auth.workspaceId,
      name: body.name,
      description: body.description,
    }).returning();

    return reply.status(201).send({
      watchlist: {
        id: result.id,
        name: result.name,
        description: result.description,
        itemCount: 0,
        createdAt: result.createdAt,
        items: [],
      },
    });
  });

  // POST /api/watchlists/:id/items — Add item to watchlist
  app.post('/:id/items', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = addItemSchema.parse(request.body);

    // Verify watchlist ownership
    const wl = await db.query.watchlists.findFirst({
      where: eq(watchlists.id, id),
    });

    if (!wl || wl.workspaceId !== auth.workspaceId) {
      throw new AppError('Watchlist not found', 404, 'NOT_FOUND');
    }

    // Add item (idempotent — on conflict do nothing)
    const item = await db.insert(watchlistItems).values({
      watchlistId: id,
      entityType: body.entityType,
      entityId: body.entityId,
      notes: body.notes,
      tags: body.tags || [],
    }).onConflictDoNothing().returning();

    if (!item) {
      throw new AppError('Item already in watchlist', 409, 'DUPLICATE_ITEM');
    }

    return reply.status(201).send({
      item: {
        id: item[0].id,
        entityType: item[0].entityType,
        entityId: item[0].entityId,
        notes: item[0].notes,
        tags: item[0].tags,
      },
    });
  });

  // DELETE /api/watchlists/:id/items/:itemId — Remove item
  app.delete('/:id/items/:itemId', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id, itemId } = request.params as { id: string; itemId: string };

    // Verify watchlist ownership
    const wl = await db.query.watchlists.findFirst({
      where: eq(watchlists.id, id),
    });

    if (!wl || wl.workspaceId !== auth.workspaceId) {
      throw new AppError('Watchlist not found', 404, 'NOT_FOUND');
    }

    await db.delete(watchlistItems).where(
      and(
        eq(watchlistItems.id, itemId),
        eq(watchlistItems.watchlistId, id)
      )
    );

    return reply.send({ ok: true });
  });

  // DELETE /api/watchlists/:id — Delete watchlist
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };

    // Verify ownership and delete
    const result = await db.delete(watchlists).where(
      and(
        eq(watchlists.id, id),
        eq(watchlists.workspaceId, auth.workspaceId)
      )
    ).returning();

    if (!result) {
      throw new AppError('Watchlist not found', 404, 'NOT_FOUND');
    }

    return reply.send({ ok: true });
  });
}
