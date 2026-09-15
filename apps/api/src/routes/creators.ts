/**
 * Creator Discovery API — Issue #42
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { creators, videos, productCreatorLinks } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { calculateCreatorFit } from '@ttsdata/shared';
import { AppError } from '../lib/errors';

const searchSchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().optional(),
  minFollowers: z.coerce.number().optional(),
  maxFollowers: z.coerce.number().optional(),
  sort: z.enum(['followers', 'engagement', 'recent', 'fit']).default('followers'),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export async function registerCreatorRoutes(app: FastifyInstance) {

  // GET /api/creators — Search and filter creators
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const params = searchSchema.parse(request.query);

    // Build where conditions
    const conditions: any[] = [sql`TRUE`];

    if (params.q) {
      conditions.push(sql`c.display_name ILIKE ${`%${params.q}%`}`);
    }
    if (params.minFollowers !== undefined) {
      conditions.push(sql`c.follower_count >= ${params.minFollowers}`);
    }
    if (params.maxFollowers !== undefined) {
      conditions.push(sql`c.follower_count <= ${params.maxFollowers}`);
    }

    // Sort mapping
    const sortMap: Record<string, any> = {
      followers: 'c.follower_count DESC',
      engagement: 'c.follower_count DESC', // placeholder — engagement needs join
      recent: 'c.updated_at DESC',
      fit: 'c.follower_count DESC', // placeholder — fit score computed below
    };

    // Fetch creators
    const result = await db.execute(sql`
      SELECT 
        c.id,
        c.display_name as "displayName",
        c.avatar_url as "avatarUrl",
        c.follower_count as "followerCount",
        c.affiliate_status as "affiliateStatus",
        c.created_at as "createdAt",
        c.updated_at as "updatedAt",
        COUNT(DISTINCT pcl.product_id) as "productCount",
        COUNT(DISTINCT v.id) as "videoCount",
        COALESCE(SUM(v.like_count), 0) as "likes",
        COALESCE(SUM(v.view_count), 0) as "views"
      FROM creators c
      LEFT JOIN product_creator_links pcl ON c.id = pcl.creator_id
      LEFT JOIN videos v ON c.id = v.creator_id
      WHERE ${conditions.reduce((a, b) => sql`${a} AND ${b}`)}
      GROUP BY c.id
      ORDER BY ${sql.raw(sortMap[params.sort])}
      LIMIT ${params.limit} OFFSET ${(params.page - 1) * params.limit}
    `);

    // Calculate fit scores for each creator
    const creatorsWithFit = result.rows.map((row: any) => {
      const fit = calculateCreatorFit({
        creatorId: row.id as string,
        displayName: row.displayName as string,
        marketplace: 'BR',
        followerCount: row.followerCount as number,
        videoCount: row.videoCount as number,
        totalEngagement: Number(row.likes || 0) + Number(row.views || 0) * 0.1,
        recentVideoCount: 0, // would need a recent-videos query
      }, { weights: { followers: 0.20, engagement: 0.30, recentPerformance: 0.25, consistency: 0.15, viralPenalty: 0.10 }, minVideosForConfidence: 10, minEngagementForConfidence: 100 });

      return {
        ...row,
        fitScore: fit.score,
        fitConfidence: fit.confidence,
      };
    });

    return reply.send({
      data: creatorsWithFit,
      pagination: {
        page: params.page,
        limit: params.limit,
      },
    });
  });

  // GET /api/creators/:id — Creator detail
  app.get('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };

    // Fetch creator
    const creator = await db.query.creators.findFirst({
      where: eq(creators.id, id),
    });

    if (!creator) {
      throw new AppError('Creator not found', 404, 'NOT_FOUND');
    }

    // Fetch top videos (by engagement)
    const topVideos = await db.query.videos.findMany({
      where: eq(videos.creatorId, id),
      orderBy: desc(videos.publishedAt),
      limit: 10,
    });

    // Fetch linked products
    const productLinks = await db.query.productCreatorLinks.findMany({
      where: eq(productCreatorLinks.creatorId, id),
    });

    // Calculate fit score
    const allVideos = await db.query.videos.findMany({
      where: eq(videos.creatorId, id),
    });

    const fit = calculateCreatorFit({
      creatorId: creator.id,
      displayName: creator.displayName,
      marketplace: creator.marketplace,
      followerCount: creator.followerCount || 0,
      videoCount: allVideos.length,
      totalEngagement: allVideos.reduce((sum, v) => sum + (v.likeCount || 0) + (v.shareCount || 0), 0),
      recentVideoCount: allVideos.filter((v) => v.publishedAt && v.publishedAt > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length,
      consistencyScore: 50, // default — would compute from video-level data
      outlierRatio: 2.0, // default — would compute from video-level data
    });

    return reply.send({
      creator: {
        id: creator.id,
        displayName: creator.displayName,
        avatarUrl: creator.avatarUrl,
        followerCount: creator.followerCount,
        affiliateStatus: creator.affiliateStatus,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
      },
      metrics: {
        videoCount: allVideos.length,
        productCount: productLinks.length,
        totalEngagement: allVideos.reduce((sum, v) => sum + (v.likeCount || 0) + (v.shareCount || 0), 0),
        fitScore: fit.score,
        fitConfidence: fit.confidence,
        fitComponents: fit.components,
      },
      topVideos: topVideos.map((v) => ({
        id: v.id,
        title: v.title,
        thumbnailUrl: v.thumbnailUrl,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        publishedAt: v.publishedAt,
      })),
    });
  });
}
