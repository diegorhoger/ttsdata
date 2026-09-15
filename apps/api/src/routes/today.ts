/**
 * Today Opportunity Feed API — TTS-M2-01
 * 
 * Personalized feed of products ranked by Opportunity Score.
 * Only shows products with fresh data and valid scores.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../lib/db';
import { products, opportunityScores, saturationScores, trendSignals, productSnapshots } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

export async function registerTodayRoutes(app: FastifyInstance) {

  // GET /api/today — Personalized opportunity feed
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Fetch products with fresh scores (calculated in last 24h)
    const recentScores = await db.query.opportunityScores.findMany({
      where: and(
        gte(opportunityScores.calculatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
      orderBy: desc(opportunityScores.score),
      limit: 20,
    });

    // Fetch corresponding saturation scores
    const saturationResults = await Promise.all(
      recentScores.map(async (score) => {
        const sat = await db.query.saturationScores.findFirst({
          where: and(
            eq(saturationScores.productId, score.productId),
            gte(saturationScores.calculatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
          orderBy: desc(saturationScores.calculatedAt),
        });
        return { productId: score.productId, saturation: sat };
      })
    );
    const satMap = new Map(saturationResults.map((r) => [r.productId, r.saturation]));

    // Fetch corresponding trend signals  
    const trendResults = await Promise.all(
      recentScores.map(async (score) => {
        const trend = await db.query.trendSignals.findFirst({
          where: and(
            eq(trendSignals.productId, score.productId),
            eq(trendSignals.window, '7d'),
            gte(trendSignals.calculatedAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
          ),
          orderBy: desc(trendSignals.calculatedAt),
        });
        return { productId: score.productId, trend };
      })
    );
    const trendMap = new Map(trendResults.map((r) => [r.productId, r.trend]));

    // Fetch product details (batch query)
    const productIds = recentScores.map((s) => s.productId);
    const productResults = await db.execute(sql`
      SELECT * FROM products WHERE id = ANY(${productIds})
    `);
    const productMap = new Map(productResults.rows.map((r: any) => [r.id, r]));

    // Assemble feed items
    const feed = recentScores.map((score) => {
      const product = productMap.get(score.productId);
      const saturation = satMap.get(score.productId);
      const trend = trendMap.get(score.productId);

      if (!product) return null;

      return {
        productId: score.productId,
        title: (product as any).title,
        imageUrl: (product as any).imageUrl,
        marketplace: score.marketplace,
        categoryId: score.categoryId,
        opportunityScore: {
          score: score.score,
          confidence: score.confidence,
          components: score.components,
          calculatedAt: score.calculatedAt,
        },
        saturation: saturation ? {
          level: saturation.level,
          score: saturation.score,
          explanation: saturation.explanation,
        } : null,
        trend: trend ? {
          growthRate: parseFloat(trend.growthRate),
          lifecycle: trend.lifecycle,
          confidence: trend.confidence,
        } : null,
      };
    }).filter(Boolean);

    return reply.send({
      feed,
      generatedAt: new Date().toISOString(),
      total: feed.length,
    });
  });
}
