/**
 * Creator Fit Score — ranks creators for opportunity matching.
 * 
 * Requires creator data: followers, engagement metrics, video count,
 * content frequency, category relevance.
 * 
 * This is API-independent — works with any ingested creator data.
 */

export interface CreatorMetrics {
  creatorId: string;
  displayName: string;
  marketplace: string;
  categoryId?: string;
  
  // Observed fields
  followerCount?: number;
  videoCount?: number;
  totalEngagement?: number;      // likes + shares + comments across all videos
  medianEngagement?: number;     // median engagement per video (better signal than total)
  recentVideoCount?: number;     // videos in last 30 days
  
  // Calculated fields
  avgEngagement?: number;        // totalEngagement / videoCount
  consistencyScore?: number;     // inverse of engagement variance
  contentFrequency?: number;     // videos per week
  commercialOutcome?: number;    // verified sales / commission (where available)
  outlierRatio?: number;         // max engagement / median engagement (viral dependence)
}

export interface CreatorFitResult {
  creatorId: string;
  score: number;                    // 0-100
  confidence: 'low' | 'medium' | 'high';
  components: Array<{
    name: string;
    weight: number;
    value: number;                // 0-100
    contribution: number;         // weight * value
    explanation: string;
  }>;
  factors: {
    followerScore: number;
    engagementScore: number;
    recentPerformance: number;
    consistency: number;
    viralDependence: number;
    dataCoverage: number;
  };
}

export interface CreatorFitConfig {
  // Weights (sum to 1.0)
  weights: {
    followers: number;
    engagement: number;
    recentPerformance: number;
    consistency: number;
    viralPenalty: number;
  };
  // Minimum data requirements for high confidence
  minVideosForConfidence: number;
  minEngagementForConfidence: number;
}

export const DEFAULT_CREATOR_FIT_CONFIG: CreatorFitConfig = {
  weights: {
    followers: 0.20,
    engagement: 0.30,
    recentPerformance: 0.25,
    consistency: 0.15,
    viralPenalty: 0.10,
  },
  minVideosForConfidence: 10,
  minEngagementForConfidence: 100,
};

/**
 * Calculate Creator Fit Score.
 * 
 * The Creator Fit Score rewards consistent, engaged creators with
 * diversified reach — not just one viral hit.
 * 
 * Score = sum(weight * factor) for each component.
 * Higher score = better fit for product promotion.
 */
export function calculateCreatorFit(
  metrics: CreatorMetrics,
  config: CreatorFitConfig = DEFAULT_CREATOR_FIT_CONFIG
): CreatorFitResult {
  const { weights } = config;
  const components: CreatorFitResult['components'] = [];

  // 1. Follower Score — normalized against marketplace cohort
  // We don't have cohort data here, so use a simple log scale
  const followerScore = clamp(
    metrics.followerCount ? Math.log10(metrics.followerCount + 1) * 20 : 0,
    0, 100
  );
  components.push({
    name: 'followers',
    weight: weights.followers,
    value: followerScore,
    contribution: weights.followers * followerScore,
    explanation: metrics.followerCount
      ? `${metrics.followerCount.toLocaleString('pt-BR')} followers — ${followerScore >= 70 ? 'strong reach' : followerScore >= 40 ? 'moderate reach' : 'limited reach'}`
      : 'No follower data',
  });

  // 2. Engagement Score — median engagement per video (not total — avoids one-hit wonders)
  const engScore = clamp(
    metrics.medianEngagement
      ? Math.log10(metrics.medianEngagement + 1) * 25
      : metrics.avgEngagement
      ? Math.log10(metrics.avgEngagement + 1) * 20
      : 0,
    0, 100
  );
  components.push({
    name: 'engagement',
    weight: weights.engagement,
    value: engScore,
    contribution: weights.engagement * engScore,
    explanation: metrics.medianEngagement
      ? `Median engagement ${Math.round(metrics.medianEngagement)}/video`
      : 'Insufficient engagement data',
  });

  // 3. Recent Performance — has the creator been active recently?
  const recentScore = clamp(
    metrics.recentVideoCount
      ? Math.min(metrics.recentVideoCount / 5, 1) * 100  // 5+ recent videos = max
      : 0,
    0, 100
  );
  components.push({
    name: 'recent_performance',
    weight: weights.recentPerformance,
    value: recentScore,
    contribution: weights.recentPerformance * recentScore,
    explanation: metrics.recentVideoCount
      ? `${metrics.recentVideoCount} recent videos — ${recentScore >= 70 ? 'very active' : recentScore >= 40 ? 'moderately active' : 'low recent activity'}`
      : 'No recent video data',
  });

  // 4. Consistency — low variance = more reliable
  // consistencyScore should be pre-calculated from video-level data
  // Higher = more consistent
  const consistency = clamp(metrics.consistencyScore || 0, 0, 100);
  components.push({
    name: 'consistency',
    weight: weights.consistency,
    value: consistency,
    contribution: weights.consistency * consistency,
    explanation: consistency >= 70
      ? 'Consistent engagement across videos'
      : consistency >= 40
      ? 'Moderate consistency'
      : 'Inconsistent or insufficient data',
  });

  // 5. Viral Dependence — penalize creators with one massive outlier
  // outlierRatio = max/median engagement across videos
  // High ratio = dependent on viral hits, less reliable
  const outlierRatio = metrics.outlierRatio || 1.0;
  const viralPenalty = clamp(
    Math.max(0, (outlierRatio - 2) / 8) * 100,  // ratio 2→0 penalty, 10→100 penalty
    0, 100
  );
  const viralScore = 100 - viralPenalty;
  components.push({
    name: 'viral_dependence',
    weight: weights.viralPenalty,
    value: viralScore,
    contribution: weights.viralPenalty * viralScore,
    explanation: outlierRatio <= 2
      ? 'Balanced engagement — no single viral hit driving results'
      : outlierRatio <= 5
      ? 'Some viral concentration — results depend on hits'
      : 'High viral dependence — unreliable for consistent promotion',
  });

  // Compute total score
  const totalScore = components.reduce((sum, c) => sum + c.contribution, 0);

  // Confidence based on data coverage
  const dataPoints = [
    metrics.followerCount,
    metrics.videoCount,
    metrics.totalEngagement,
    metrics.medianEngagement,
    metrics.recentVideoCount,
  ].filter((v) => v !== null && v !== undefined && v > 0).length;

  const hasEnoughVideos = (metrics.videoCount || 0) >= config.minVideosForConfidence;
  const hasEnoughEngagement = (metrics.totalEngagement || 0) >= config.minEngagementForConfidence;
  const hasRecentData = (metrics.recentVideoCount || 0) > 0;

  const confidence: 'low' | 'medium' | 'high' =
    dataPoints >= 4 && hasEnoughVideos && hasEnoughEngagement && hasRecentData
      ? 'high'
      : dataPoints >= 3 && hasEnoughVideos
      ? 'medium'
      : 'low';

  return {
    creatorId: metrics.creatorId,
    score: Math.round(totalScore),
    confidence,
    components,
    factors: {
      followerScore,
      engagementScore: engScore,
      recentPerformance: recentScore,
      consistency,
      viralDependence: viralScore,
      dataCoverage: clamp((dataPoints / 5) * 100, 0, 100),
    },
  };
}

/**
 * Rank creators by fit score.
 * Returns sorted list (highest first) with rank.
 */
export function rankCreators(
  metricsList: CreatorMetrics[],
  config: CreatorFitConfig = DEFAULT_CREATOR_FIT_CONFIG
): Array<{ creator: CreatorMetrics; fit: CreatorFitResult; rank: number }> {
  const results = metricsList.map((creator) => ({
    creator,
    fit: calculateCreatorFit(creator, config),
  }));

  // Sort by score descending
  results.sort((a, b) => b.fit.score - a.fit.score);

  // Assign ranks
  return results.map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
