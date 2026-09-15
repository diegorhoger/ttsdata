/**
 * My Performance Dashboard API — Issue #46
 * 
 * Returns authorized TikTok Shop performance data for the connected user.
 * Unavailable metrics are explicitly identified - never synthesized.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../lib/db';
import { tiktokConnections, products, productSnapshots, videos, creators, productCreatorLinks } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

const exportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export async function registerMyPerformanceRoutes(app: FastifyInstance) {

  // GET /api/my-performance — Dashboard overview
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Get user connection
    const connections = await db.query.tiktokConnections.findMany({
      where: and(
        eq(tiktokConnections.userId, auth.userId),
        eq(tiktokConnections.status, 'active'),
      ),
      orderBy: desc(tiktokConnections.createdAt),
      limit: 1,
    });
    const connection = connections[0] ?? null;

    if (!connection) {
      return reply.status(400).send({
        error: 'NO_CONNECTION',
        message: 'No active TikTok Shop connection. Connect your account to see performance data.',
      });
    }

    // Aggregate performance metrics from user's product snapshots
    const metricsResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT p.id)::int as "productCount",
        COALESCE(SUM(ps.sales_volume), 0)::int as "totalSalesVolume",
        COALESCE(AVG(ps.commission_rate), 0)::float as "avgCommissionRate",
        COALESCE(AVG(ps.rating), 0)::float as "avgRating",
        COUNT(DISTINCT v.id)::int as "videoCount",
        COALESCE(SUM(v.view_count), 0)::int as "totalViews",
        COALESCE(SUM(v.like_count), 0)::int as "totalLikes"
      FROM products p
      LEFT JOIN LATERAL (
        SELECT * FROM product_snapshots 
        WHERE product_id = p.id 
        ORDER BY observed_at DESC 
        LIMIT 1
      ) ps ON true
      LEFT JOIN videos v ON p.id = v.product_id
      WHERE p.id IN (
        SELECT DISTINCT product_id FROM product_creator_links 
        WHERE creator_id IN (SELECT id FROM creators WHERE marketplace = ${connection.marketplace})
      )
    `);

    const metricsRow = (metricsResult.rows?.[0] || {}) as Record<string, any>;

    // Check metric availability
    const m = {
      productCount: Number(metricsRow.productCount || 0),
      totalSalesVolume: Number(metricsRow.totalSalesVolume || 0),
      avgCommissionRate: Number(metricsRow.avgCommissionRate || 0),
      avgRating: Number(metricsRow.avgRating || 0),
      videoCount: Number(metricsRow.videoCount || 0),
      totalViews: Number(metricsRow.totalViews || 0),
      totalLikes: Number(metricsRow.totalLikes || 0),
    };

    return reply.send({
      overview: {
        ...m,
        // Metric classification labels
        classifications: {
          totalSalesVolume: m.totalSalesVolume > 0 ? 'calculated' : 'unavailable',
          avgCommissionRate: m.avgCommissionRate > 0 ? 'observed' : 'unavailable',
          avgRating: m.avgRating > 0 ? 'observed' : 'unavailable',
          videoCount: m.videoCount > 0 ? 'observed' : 'unavailable',
          totalViews: m.totalViews > 0 ? 'observed' : 'unavailable',
          totalLikes: m.totalLikes > 0 ? 'observed' : 'unavailable',
        },
      },
      connection: {
        marketplace: connection.marketplace,
        lastSyncAt: connection.lastSyncAt,
      },
      // Explicitly unavailable fields (API limitation)
      unavailable: [
        { field: 'realTimeGMV', reason: 'API does not provide real-time GMV; only snapshot aggregates' },
        { field: 'buyerDemographics', reason: 'Not supported by current TikTok Shop API scopes' },
        { field: 'conversionRate', reason: 'Attribution data requires deeper API scopes not yet granted' },
      ],
      generatedAt: new Date().toISOString(),
    });
  });

  // GET /api/my-performance/export — Export data
  app.get('/export', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const params = exportSchema.parse(request.query);

    // Fetch all products for the user
    const connections = await db.query.tiktokConnections.findMany({
      where: and(
        eq(tiktokConnections.userId, auth.userId),
        eq(tiktokConnections.status, 'active'),
      ),
      limit: 1,
    });
    const connection = connections[0] ?? null;

    if (!connection) {
      throw new AppError('No active connection', 400, 'NO_CONNECTION');
    }

    const rows = await db.execute(sql`
      SELECT 
        p.id as "productId",
        p.title,
        p.marketplace,
        ps.price,
        ps.commission_rate as "commissionRate",
        ps.sales_volume as "salesVolume",
        ps.rating,
        ps.observed_at as "observedAt"
      FROM products p
      LEFT JOIN LATERAL (
        SELECT * FROM product_snapshots 
        WHERE product_id = p.id 
        ORDER BY observed_at DESC 
        LIMIT 1
      ) ps ON true
      WHERE p.id IN (
        SELECT DISTINCT product_id FROM product_creator_links 
        WHERE creator_id IN (SELECT id FROM creators WHERE marketplace = ${connection.marketplace})
      )
      ORDER BY ps.sales_volume DESC NULLS LAST
    `);

    if (params.format === 'csv') {
      const header = 'Product ID,Title,Marketplace,Price,Commission Rate,Sales Volume,Rating,Observed At';
      const lines = rows.rows.map((r: any) =>
        `${r.productId},"${r.title.replace(/"/g, '""')}",${r.marketplace},${r.price},${r.commissionRate},${r.salesVolume},${r.rating},${r.observedAt}`
      );
      const csv = [header, ...lines].join('\n');

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="my-performance-${new Date().toISOString().slice(0, 10)}.csv"`);
      return reply.send(csv);
    }

    return reply.send({
      data: rows.rows,
      exportedAt: new Date().toISOString(),
      format: params.format,
    });
  });
}
