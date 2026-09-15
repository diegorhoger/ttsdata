/**
 * Scoring pipeline — uses shared scoring functions + db persistence
 */
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import type { Database } from './db';
import { calculateOpportunityScore, calculateSaturation } from '@ttsdata/shared';
import { 
  productSnapshots, trendSignals, productCreatorLinks, videos,
  opportunityScores, saturationScores, products,
} from '@ttsdata/db/src/schema';

const SCORING_VERSION = 'v1';

export async function runScoringPipeline(db: any, marketplace: string = 'BR'): Promise<number> {
  const activeProducts = await db.query.products.findMany({
    where: eq(products.marketplace, marketplace),
  });

  let scored = 0;
  for (const product of activeProducts) {
    await scoreProduct(db, product.id, marketplace, product.categoryId || undefined);
    scored++;
  }

  console.log(`Scored ${scored} products for ${marketplace}`);
  return scored;
}

async function scoreProduct(db: any, productId: string, marketplace: string, categoryId?: string) {
  const latestTrend = await db.query.trendSignals.findFirst({
    where: and(
      eq(trendSignals.productId, productId),
      eq(trendSignals.window, '7d')
    ),
    orderBy: desc(trendSignals.calculatedAt),
  });

  const latestSnapshot = await db.query.productSnapshots.findFirst({
    where: eq(productSnapshots.productId, productId),
    orderBy: desc(productSnapshots.observedAt),
  });

  const [creatorResult] = await db.select({ count: sql<number>`COUNT(DISTINCT creator_id)` })
    .from(productCreatorLinks)
    .where(eq(productCreatorLinks.productId, productId));

  const [videoResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(videos)
    .where(and(
      eq(videos.productId, productId),
      gte(videos.publishedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ));

  const creatorCount = creatorResult?.count || 0;
  const recentVideoCount = videoResult?.count || 0;

  const saturation = calculateSaturation({
    creatorCount,
    videoVelocity: recentVideoCount,
    concentration: 0.5,
    trendAgeDays: 14,
    contentToCommercialRatio: 1.0,
  });

  const input = {
    productId,
    marketplace,
    categoryId,
    momentum: latestTrend ? parseFloat(latestTrend.growthRate as any) * 100 : 0,
    commercialTraction: latestSnapshot?.salesVolume ? Math.min(Math.min(latestSnapshot.salesVolume / 1000, 100), 100) : 0,
    commissionRate: latestSnapshot ? parseFloat(latestSnapshot.commissionRate) : 0,
    saturationInverse: 100 - saturation.score,
    contentVelocity: Math.min(recentVideoCount * 10, 100),
    qualityStability: latestSnapshot?.rating ? (parseFloat(latestSnapshot.rating) / 5) * 100 : 50,
  };

  const oppScore = calculateOpportunityScore(input);

  await db.insert(opportunityScores).values({
    productId,
    version: SCORING_VERSION,
    marketplace,
    categoryId,
    score: oppScore.score,
    confidence: oppScore.confidence,
    components: oppScore.components,
    cohort: categoryId ? `${marketplace}:${categoryId}` : `${marketplace}:all`,
    calculatedAt: new Date(),
  });

  await db.insert(saturationScores).values({
    productId,
    version: SCORING_VERSION,
    marketplace,
    level: saturation.level,
    score: saturation.score,
    factors: {
      creatorCount,
      videoVelocity: recentVideoCount,
      concentration: 0.5,
      trendAge: 14,
      contentToCommercialRatio: 1.0,
    },
    explanation: saturation.explanation,
    calculatedAt: new Date(),
  });
}

export { calculateOpportunityScore, calculateSaturation };
