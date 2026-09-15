/**
 * Scoring pipeline job — calculates Opportunity + Saturation scores
 * 
 * Runs on a scheduled basis via BullMQ (every 4 hours).
 * Reads snapshots, trends, creator links, videos from the database,
 * computes scores, and stores results for the Today feed and
 * Personal Performance Score.
 */

import { db } from '../lib/db';
import {
  products, productSnapshots, trendSignals, productCreatorLinks, videos,
  opportunityScores, saturationScores,
  type Product,
  type ProductSnapshot,
  type TrendSignal,
} from '@ttsdata/db/src/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';

interface ScoringResult {
  productsScored: number;
  opportunitiesCreated: number;
  saturationsCreated: number;
  errors: string[];
}

/**
 * Run the full scoring pipeline for a marketplace.
 * Opportunity Score v1:
 *   30% Momentum + 20% Commercial traction + 15% Commission
 *   + 15% Low saturation + 10% Content velocity + 10% Quality
 * Saturation Score v1:
 *   30% Creator count + 25% Video velocity + 20% Concentration
 *   + 15% Trend age + 10% Content-to-commercial ratio
 */
export async function runScoringPipeline(marketplace: string = 'BR'): Promise<ScoringResult> {
  const result: ScoringResult = {
    productsScored: 0,
    opportunitiesCreated: 0,
    saturationsCreated: 0,
    errors: [],
  };

  try {
    // Fetch all active products for the marketplace
    const activeProducts = await db.query.products.findMany({
      where: eq(products.marketplace, marketplace),
    });

    for (const product of activeProducts) {
      try {
        await scoreProduct(product, marketplace);
        result.productsScored++;
      } catch (err) {
        result.errors.push(`Product ${product.id}: ${(err as Error).message}`);
      }
    }

    console.log(`Scoring pipeline complete: ${result.productsScored} products scored`);
  } catch (err) {
    console.error('Scoring pipeline failed:', err);
    result.errors.push(`Pipeline: ${(err as Error).message}`);
  }

  return result;
}

async function scoreProduct(product: Product, marketplace: string): Promise<void> {
  // Fetch all required inputs
  const latestTrend = await db.query.trendSignals.findFirst({
    where: and(
      eq(trendSignals.productId, product.id),
      eq(trendSignals.window, '7d'),
    ),
    orderBy: desc(trendSignals.calculatedAt),
  });

  const latestSnapshot = await db.query.productSnapshots.findFirst({
    where: eq(productSnapshots.productId, product.id),
    orderBy: desc(productSnapshots.observedAt),
  });

  const [creatorResult] = await db.select({ count: sql<number>`COUNT(DISTINCT creator_id)` })
    .from(productCreatorLinks)
    .where(eq(productCreatorLinks.productId, product.id));

  const [videoResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(videos)
    .where(and(
      eq(videos.productId, product.id),
      gte(videos.publishedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    ));

  const creatorCount = Number(creatorResult?.count || 0);
  const recentVideoCount = Number(videoResult?.count || 0);

  // Compute saturation first (needed for opportunity)
  const saturation = calculateSaturation({
    creatorCount,
    videoVelocity: recentVideoCount,
    concentration: 0.5, // Default moderate concentration
    trendAgeDays: latestTrend ? 14 : 0,
    contentToCommercialRatio: 1.0,
  });

  // Compute opportunity score
  const momentum = latestTrend ? parseFloat(latestTrend.growthRate as any) * 100 : 0;
  const commercialTraction = latestSnapshot?.salesVolume
    ? clamp(Math.min(latestSnapshot.salesVolume / 1000, 100), 0, 100)
    : 0;
  const commissionRate = latestSnapshot ? parseFloat(latestSnapshot.commissionRate) : 0;
  const saturationInverse = 100 - saturation.score;
  const contentVelocity = Math.min(recentVideoCount * 10, 100);
  const qualityStability = latestSnapshot?.rating
    ? (parseFloat(latestSnapshot.rating) / 5) * 100
    : 50;

  const opportunity = calculateOpportunityScore({
    productId: product.id,
    marketplace,
    categoryId: product.categoryId || undefined,
    momentum,
    commercialTraction,
    commissionRate,
    saturationInverse,
    contentVelocity,
    qualityStability,
  });

  // Store scores
  await db.insert(opportunityScores).values({
    productId: product.id,
    version: 'v1',
    marketplace,
    categoryId: product.categoryId,
    score: opportunity.score,
    confidence: opportunity.confidence,
    components: opportunity.components,
    cohort: product.categoryId ? `${marketplace}:${product.categoryId}` : `${marketplace}:all`,
    calculatedAt: new Date(),
  });

  await db.insert(saturationScores).values({
    productId: product.id,
    version: 'v1',
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface ScoreInput {
  productId: string;
  marketplace: string;
  categoryId?: string;
  momentum: number;
  commercialTraction: number;
  commissionRate: number;
  saturationInverse: number;
  contentVelocity: number;
  qualityStability: number;
}

interface ScoreComponent {
  name: string;
  weight: number;
  rawValue: number;
  normalizedValue: number;
  contribution: number;
  explanation: string;
}

interface OpportunityScoreResult {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  components: ScoreComponent[];
}

function calculateOpportunityScore(input: ScoreInput): OpportunityScoreResult {
  const weights = {
    momentum: 0.30,
    commercialTraction: 0.20,
    commission: 0.15,
    saturation: 0.15,
    contentVelocity: 0.10,
    quality: 0.10,
  };

  const components: ScoreComponent[] = [
    {
      name: 'momentum',
      weight: weights.momentum,
      rawValue: input.momentum,
      normalizedValue: clamp(input.momentum, 0, 100),
      contribution: weights.momentum * clamp(input.momentum, 0, 100),
      explanation: input.momentum > 70 ? 'Strong recent growth indicates rising demand' : input.momentum > 40 ? 'Moderate growth detected' : 'Limited momentum in recent windows',
    },
    {
      name: 'commercial_traction',
      weight: weights.commercialTraction,
      rawValue: input.commercialTraction,
      normalizedValue: clamp(input.commercialTraction, 0, 100),
      contribution: weights.commercialTraction * clamp(input.commercialTraction, 0, 100),
      explanation: input.commercialTraction > 70 ? 'High sales volume and velocity' : input.commercialTraction > 40 ? 'Moderate commercial activity' : 'Limited commercial traction',
    },
    {
      name: 'commission_attractiveness',
      weight: weights.commission,
      rawValue: input.commissionRate * 100,
      normalizedValue: clamp(input.commissionRate * 100, 0, 100),
      contribution: weights.commission * clamp(input.commissionRate * 100, 0, 100),
      explanation: input.commissionRate > 0.20 ? `High commission rate at ${(input.commissionRate * 100).toFixed(1)}%` : input.commissionRate > 0.10 ? `Moderate commission rate at ${(input.commissionRate * 100).toFixed(1)}%` : `Low commission rate at ${(input.commissionRate * 100).toFixed(1)}%`,
    },
    {
      name: 'low_saturation',
      weight: weights.saturation,
      rawValue: input.saturationInverse,
      normalizedValue: clamp(input.saturationInverse, 0, 100),
      contribution: weights.saturation * clamp(input.saturationInverse, 0, 100),
      explanation: input.saturationInverse > 70 ? 'Few active creators - opportunity for differentiation' : input.saturationInverse > 40 ? 'Moderate creator competition' : 'High creator saturation - established market',
    },
    {
      name: 'content_velocity',
      weight: weights.contentVelocity,
      rawValue: input.contentVelocity,
      normalizedValue: clamp(input.contentVelocity, 0, 100),
      contribution: weights.contentVelocity * clamp(input.contentVelocity, 0, 100),
      explanation: input.contentVelocity > 70 ? 'Accelerating content production around this product' : input.contentVelocity > 40 ? 'Steady content creation' : 'Low recent content activity',
    },
    {
      name: 'product_quality',
      weight: weights.quality,
      rawValue: input.qualityStability,
      normalizedValue: clamp(input.qualityStability, 0, 100),
      contribution: weights.quality * clamp(input.qualityStability, 0, 100),
      explanation: input.qualityStability > 70 ? 'High ratings and stable pricing' : input.qualityStability > 40 ? 'Acceptable quality metrics' : 'Quality or stability concerns',
    },
  ];

  const totalScore = components.reduce((sum, c) => sum + c.contribution, 0);

  const dataPoints = [
    input.momentum,
    input.commercialTraction,
    input.commissionRate,
    input.saturationInverse,
    input.contentVelocity,
    input.qualityStability,
  ].filter((v) => v !== null && v !== undefined && v > 0).length;

  const confidence: 'low' | 'medium' | 'high' =
    dataPoints >= 5 ? 'high' : dataPoints >= 3 ? 'medium' : 'low';

  return { score: Math.round(totalScore), confidence, components };
}

interface SaturationInput {
  creatorCount: number;
  videoVelocity: number;
  concentration: number;
  trendAgeDays: number;
  contentToCommercialRatio: number;
}

interface SaturationResult {
  level: 'low' | 'moderate' | 'high' | 'unknown';
  score: number;
  explanation: string;
}

function calculateSaturation(input: SaturationInput): SaturationResult {
  if (input.creatorCount === 0) {
    return { level: 'unknown', score: 0, explanation: 'Insufficient data to assess creator saturation' };
  }

  const factors = {
    creatorCount: clamp(Math.min(input.creatorCount / 50, 1) * 100, 0, 100),
    videoVelocity: clamp(Math.min(input.videoVelocity / 20, 1) * 100, 0, 100),
    concentration: clamp(input.concentration * 100, 0, 100),
    trendAge: clamp(Math.min(input.trendAgeDays / 30, 1) * 100, 0, 100),
    ratio: clamp(input.contentToCommercialRatio * 50, 0, 100),
  };

  const score = Math.round(
    factors.creatorCount * 0.30 +
    factors.videoVelocity * 0.25 +
    factors.concentration * 0.20 +
    factors.trendAge * 0.15 +
    factors.ratio * 0.10
  );

  const level: 'low' | 'moderate' | 'high' | 'unknown' =
    score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low';

  const explanations: Record<string, string> = {
    low: `Only ${input.creatorCount} active creators with ${input.videoVelocity} new videos recently. Low competition window.`,
    moderate: `${input.creatorCount} creators with growing content velocity. Enter with differentiated angle.`,
    high: `High saturation: ${input.creatorCount} creators, ${input.videoVelocity} new videos. Hard to differentiate.`,
    unknown: 'Insufficient data',
  };

  return { level, score, explanation: explanations[level] || 'Insufficient data' };
}
