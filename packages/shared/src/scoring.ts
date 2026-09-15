/**
 * Scoring engine v1 — pure functions, no db dependency
 * PRD §10 Initial scoring model
 */

export interface ScoreInput {
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

export interface ScoreComponent {
  name: string;
  weight: number;
  rawValue: number;
  normalizedValue: number;
  contribution: number;
  explanation: string;
}

export interface OpportunityScoreResult {
  score: number;
  confidence: 'low' | 'medium' | 'high';
  components: ScoreComponent[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculateOpportunityScore(input: ScoreInput): OpportunityScoreResult {
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
  ].filter(v => v !== null && v !== undefined && v > 0).length;
  
  const confidence: 'low' | 'medium' | 'high' = 
    dataPoints >= 5 ? 'high' : dataPoints >= 3 ? 'medium' : 'low';

  return {
    score: Math.round(totalScore),
    confidence,
    components,
  };
}

export interface SaturationInput {
  creatorCount: number;
  videoVelocity: number;
  concentration: number;
  trendAgeDays: number;
  contentToCommercialRatio: number;
}

export interface SaturationResult {
  level: 'low' | 'moderate' | 'high' | 'unknown';
  score: number;
  explanation: string;
}

export function calculateSaturation(input: SaturationInput): SaturationResult {
  if (input.creatorCount === 0) {
    return {
      level: 'unknown',
      score: 0,
      explanation: 'Insufficient data to assess creator saturation',
    };
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
