/**
 * Data Quality Monitoring API — Issue #53
 * 
 * Provides quality metrics for entities, pipeline health, and ranking gates.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../lib/db';
import { products, productSnapshots, opportunityScores, saturationScores, trendSignals } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { generateQualityReport, isQualitySufficientForRanking, DEFAULT_QUALITY_CONFIG } from '@ttsdata/data-quality';

export async function registerDataQualityRoutes(app: FastifyInstance) {

  // GET /api/data-quality/overview — Quality metrics for all entities
  app.get('/overview', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Count entities by type
    const [productCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(products);
    const [snapshotCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(productSnapshots);
    const [scoreCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(opportunityScores);
    const [saturationCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(saturationScores);
    const [trendCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(trendSignals);

    // Count stale entities (not updated in 24h)
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [staleProducts] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(products)
      .where(sql`last_observed_at < ${dayAgo} OR last_observed_at IS NULL`);

    // Count low-confidence scores
    const [lowConfidenceScores] = await db.select({ count: sql<number>`COUNT(*)` })
      .from(opportunityScores)
      .where(sql`confidence = 'low'`);

    // Count ranking-blocked products (quality insufficient)
    const recentScores = await db.query.opportunityScores.findMany({
      where: gte(opportunityScores.calculatedAt, dayAgo),
      limit: 100,
    });

    let blockedCount = 0;
    for (const score of recentScores) {
      const report = generateQualityReport(
        'product',
        score.productId,
        score.calculatedAt,
        5, 5, 5 // fieldsPresent, fieldsTotal, validatedCount
      );
      if (!isQualitySufficientForRanking(report)) {
        blockedCount++;
      }
    }

    return reply.send({
      entities: {
        products: Number(productCount?.count || 0),
        snapshots: Number(snapshotCount?.count || 0),
        opportunityScores: Number(scoreCount?.count || 0),
        saturationScores: Number(saturationCount?.count || 0),
        trendSignals: Number(trendCount?.count || 0),
      },
      quality: {
        staleProducts: Number(staleProducts?.count || 0),
        lowConfidenceScores: Number(lowConfidenceScores?.count || 0),
        rankingBlockedProducts: blockedCount,
      },
      generatedAt: new Date().toISOString(),
    });
  });

  // GET /api/data-quality/entity/:type/:id — Quality report for specific entity
  app.get('/entity/:type/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { type, id } = request.params as { type: string; id: string };

    // Fetch latest snapshot for the entity
    const snapshot = await db.query.productSnapshots.findFirst({
      where: eq(productSnapshots.productId, id),
      orderBy: desc(productSnapshots.observedAt),
    });

    if (!snapshot) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Entity not found' });
    }

    // Generate quality report
    const report = generateQualityReport(
      type,
      id,
      snapshot.observedAt,
      5, 5, 5 // fieldsPresent, fieldsTotal, validatedCount
    );

    return reply.send({
      entityType: type,
      entityId: id,
      report,
    });
  });
}
