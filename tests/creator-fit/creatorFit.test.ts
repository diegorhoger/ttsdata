import { describe, it, expect } from 'vitest';
import {
  calculateCreatorFit,
  rankCreators,
  CreatorMetrics,
  DEFAULT_CREATOR_FIT_CONFIG,
} from '../../packages/shared/src/creatorFit';

describe('Creator Fit Score', () => {
  const baseMetrics: CreatorMetrics = {
    creatorId: 'creator-1',
    displayName: 'Test Creator',
    marketplace: 'BR',
    categoryId: 'cat-1',
    followerCount: 50000,
    videoCount: 50,
    totalEngagement: 500000,
    medianEngagement: 8000,
    recentVideoCount: 8,
    consistencyScore: 75,
    outlierRatio: 2.5,
  };

  it('calculates a high score for a strong creator', () => {
    const result = calculateCreatorFit(baseMetrics);
    expect(result.score).toBeGreaterThan(60);
    expect(result.confidence).toBe('high');
    expect(result.components).toHaveLength(5);
  });

  it('penalizes viral dependence', () => {
    const viralCreator: CreatorMetrics = {
      ...baseMetrics,
      outlierRatio: 15, // one massive viral hit
    };
    const result = calculateCreatorFit(viralCreator);
    const viralComponent = result.components.find((c) => c.name === 'viral_dependence');
    expect(viralComponent?.value).toBeLessThan(50);
  });

  it('rewards consistency', () => {
    const consistent: CreatorMetrics = {
      ...baseMetrics,
      consistencyScore: 90,
    };
    const inconsistent: CreatorMetrics = {
      ...baseMetrics,
      consistencyScore: 20,
    };
    const consistentResult = calculateCreatorFit(consistent);
    const inconsistentResult = calculateCreatorFit(inconsistent);
    expect(consistentResult.score).toBeGreaterThan(inconsistentResult.score);
  });

  it('ranks creators by score', () => {
    const creators: CreatorMetrics[] = [
      { ...baseMetrics, creatorId: 'c1', followerCount: 100000, videoCount: 100, totalEngagement: 1000000, medianEngagement: 10000, recentVideoCount: 10, consistencyScore: 80, outlierRatio: 2 },
      { ...baseMetrics, creatorId: 'c2', followerCount: 10000, videoCount: 20, totalEngagement: 50000, medianEngagement: 2000, recentVideoCount: 3, consistencyScore: 60, outlierRatio: 5 },
      { ...baseMetrics, creatorId: 'c3', followerCount: 5000, videoCount: 10, totalEngagement: 20000, medianEngagement: 1500, recentVideoCount: 2, consistencyScore: 40, outlierRatio: 8 },
    ];

    const ranked = rankCreators(creators);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].creator.creatorId).toBe('c1'); // highest score
    expect(ranked[0].rank).toBe(1);
    expect(ranked[2].rank).toBe(3);
  });

  it('assigns low confidence for sparse data', () => {
    const sparse: CreatorMetrics = {
      creatorId: 'sparse',
      displayName: 'Sparse',
      marketplace: 'BR',
      followerCount: 100,
      videoCount: 2,
      totalEngagement: 500,
      medianEngagement: 200,
      recentVideoCount: 1,
    };
    const result = calculateCreatorFit(sparse);
    expect(result.confidence).toBe('low');
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: CreatorMetrics = {
      creatorId: 'minimal',
      displayName: 'Minimal',
      marketplace: 'BR',
    };
    const result = calculateCreatorFit(minimal);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBe('low');
  });
});
