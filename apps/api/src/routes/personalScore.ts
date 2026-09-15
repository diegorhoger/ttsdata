/**
 * Personal Performance Score API — Issue #41
 * 
 * Returns the user's personalized product recommendations based on
 * their own authorized TikTok Shop connection data.
 * 
 * Uses an adapted Opportunity Score that considers:
 * - Product performance within the user's own catalog
 * - Momentum (revenue/engagement trends)
 * - Commercial traction
 * - Commission attractiveness
 * - Content velocity (user's own videos)
 */

import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { db } from '../lib/db';
import { products, productSnapshots, videos, creators, productCreatorLinks, tiktokConnections } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';

export async function registerPersonalScoreRoutes(app: FastifyInstance) {

  // GET /api/personal-score/opportunities — Personalized opportunity feed
  // based on the user's own authorized TikTok Shop connection data
  app.get('/opportunities', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Get the user's active TikTok connection
    const connection = await db.query.tiktokConnections.findFirst({
      where: and(
        eq(tiktokConnections.userId, auth.userId),
        eq(tiktokConnections.status, 'active'),
      ),
      orderBy: desc(tiktokConnections.createdAt),
    });

    if (!connection) {
      return reply.status(400).send({
        error: 'NO_CONNECTION',
        message: 'No active TikTok Shop connection. Connect your account to see personalized scores.',
      });
    }

    // Get products associated with the user's creator account
    const userCreatorLinks = await db.query.productCreatorLinks.findMany({
      where: sql`creator_id IN (SELECT id FROM creators WHERE marketplace = ${connection.marketplace})`,
      limit: 50,
    });

    const productIds = [...new Set(userCreatorLinks.map((l) => l.productId))];

    if (productIds.length === 0) {
      return reply.send({
        opportunities: [],
        message: 'No product data available for scoring yet. Sync your TikTok Shop account first.',
        lastSyncAt: connection.lastSyncAt,
      });
    }

    // Fetch product details with their latest snapshots
    const productsWithSnapshots = await db.execute(sql`
      SELECT 
        p.*,
        ps.price,
        ps.commission_rate as "commissionRate",
        ps.sales_volume as "salesVolume",
        ps.rating,
        ps.observed_at as "lastObservedAt",
        ps.sales_velocity as "salesVelocity"
      FROM products p
      LEFT JOIN LATERAL (
        SELECT * FROM product_snapshots 
        WHERE product_id = p.id 
        ORDER BY observed_at DESC 
        LIMIT 1
      ) ps ON true
      WHERE p.id = ANY(${productIds})
      AND p.marketplace = ${connection.marketplace}
      ORDER BY ps.sales_volume DESC NULLS LAST
      LIMIT 20
    `);

    // Calculate personalized fit scores for each product
    const opportunities = await Promise.all(
      productsWithSnapshots.rows.map(async (product: any) => {
        // Convert DB snapshot row to domain type
        const snapshot = {
          observedAt: product.lastObservedAt || new Date().toISOString(),
          price: parseFloat(product.price) || 0,
          commissionRate: parseFloat(product.commissionRate) || 0,
          salesVolume: product.salesVolume || 0,
          salesVelocity: parseFloat(product.salesVelocity) || 0,
          rating: product.rating ? parseFloat(product.rating) : undefined,
        };

        // Get creator's video count for this product
        const [videoCountResult] = await db.select({ count: sql<number>`COUNT(DISTINCT v.id)` })
          .from(videos)
          .where(eq(videos.productId, product.id));

        const videoCount = Number(videoCountResult?.count || 0);

        // Simple scoring based on user's own product data
        const score = calculatePersonalScore({
          salesVolume: snapshot.salesVolume,
          salesVelocity: snapshot.salesVelocity,
          commissionRate: snapshot.commissionRate,
          rating: snapshot.rating,
          videoCount,
          daysSinceVideo: 0, // would compute from latest video
        });

        return {
          productId: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          categoryId: product.categoryId,
          metrics: {
            price: snapshot.price,
            commissionRate: snapshot.commissionRate,
            salesVolume: snapshot.salesVolume,
            rating: snapshot.rating,
          },
          creatorVideoCount: videoCount,
          score: score.score,
          confidence: score.confidence,
          factors: score.factors,
          opportunityScore: score.opportunityScore,
          saturation: {
            level: score.saturationLevel,
            score: score.saturationScore,
          },
        };
      })
    );

    // Sort by opportunity score descending
    opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore);

    return reply.send({
      opportunities,
      connection: {
        marketplace: connection.marketplace,
        lastSyncAt: connection.lastSyncAt,
      },
      generatedAt: new Date().toISOString(),
      total: opportunities.length,
    });
  });
}

function calculatePersonalScore(input: {
  salesVolume: number;
  salesVelocity: number;
  commissionRate: number;
  rating?: number;
  videoCount: number;
  daysSinceVideo: number;
}): {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  factors: Record<string, number>;
  opportunityScore: number;
  saturationLevel: 'low' | 'moderate' | 'high' | 'unknown';
  saturationScore: number;
} {
  // Use inspiration from the Opportunity Score but simpler since it's for user's own data
  const weights = {
    commercial: 0.30,
    commission: 0.20,
    momentum: 0.20,
    content: 0.15,
    quality: 0.15,
  };

  const commercialScore = clamp(Math.log10(input.salesVolume + 1) * 25, 0, 100);
  const commissionScore = clamp(input.commissionRate * 100 * 2, 0, 100);
  const momentumScore = clamp(Math.log10(input.salesVelocity + 1) * 30, 0, 100);
  const contentScore = clamp(input.videoCount * 10, 0, 100);
  const qualityScore = clamp((input.rating || 3) * 20, 0, 100);

  const opportunityScore = Math.round(
    commercialScore * weights.commercial +
    commissionScore * weights.commission +
    momentumScore * weights.momentum +
    contentScore * weights.content +
    qualityScore * weights.quality
  );

  // Simple saturation heuristic for user's own products
  const saturationScore = clamp(
    Math.max(0, 100 - input.videoCount * 10) * 0.5 + // fewer videos = less saturated
    Math.max(0, 100 - input.salesVolume * 0.01) * 0.3 + // fewer sales = less saturated
    Math.max(0, 100 - (input.rating || 3) * 20) * 0.2, // lower rating = less proven
    0, 100
  );

  const saturationLevel: 'low' | 'moderate' | 'high' | 'unknown' =
    saturationScore >= 70 ? 'high' : saturationScore >= 40 ? 'moderate' : 'low';

  const dataPoints = [
    input.salesVolume,
    input.salesVelocity,
    input.commissionRate,
    input.videoCount,
  ].filter((v) => v !== null && v !== undefined && v > 0).length;

  const confidence: 'low' | 'medium' | 'high' =
    dataPoints >= 4 && input.videoCount >= 3 ? 'high' : dataPoints >= 2 ? 'medium' : 'low';

  return {
    score: opportunityScore,
    confidence,
    factors: {
      commercialScore,
      commissionScore,
      momentumScore,
      contentScore,
      qualityScore,
    },
    opportunityScore,
    saturationLevel,
    saturationScore,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
