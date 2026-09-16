/**
 * Creator Ingestion Job — targets verified TikTok API scopes
 * 
 * Verified scopes:
 * - user.info.basic → /api/v2/user/info/ (follower count, video count)
 * - video.list → /api/v2/video/list/ (creator's public videos)
 * - video.upload → /api/v2/video/upload/ (draft posts)
 * - research.adlib.basic → /api/v2/research/adlib/basic/ (public commercial data)
 */

import { TikTokAPIClient } from '../lib/tiktok-api-client';
import { db } from '../lib/db';
import { creators, videos } from '@ttsdata/db/src/schema';
import { eq } from 'drizzle-orm';

interface IngestCreatorsData {
  marketplace: string;
  accessToken: string;
  openIds: string[];  // TikTok open IDs to ingest
}

/**
 * Ingest creator profiles and their public videos
 * using the verified TikTok API scopes.
 */
export async function ingestCreators(data: IngestCreatorsData) {
  const client = new TikTokAPIClient();
  let totalIngested = 0;
  let totalVideos = 0;

  for (const openId of data.openIds) {
    try {
      // Fetch creator profile (user.info.basic)
      const userInfo = await client.getUserInfo(data.accessToken, openId) as any;
      const user = userInfo?.data || {};

      // Upsert creator record
      const now = new Date();
      await db.insert(creators).values({
        id: user.open_id || openId,
        displayName: user.display_name || 'Unknown',
        avatarUrl: user.avatar_url || null,
        followerCount: user.follower_count || 0,
        affiliateStatus: user.is_verified ? 'active' : 'unknown',
        marketplace: data.marketplace,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: creators.id,
        set: {
          displayName: user.display_name || 'Unknown',
          avatarUrl: user.avatar_url || null,
          followerCount: user.follower_count || 0,
          updatedAt: now,
        },
      });

      totalIngested++;

      // Fetch creator's public videos (video.list)
      let cursor: string | undefined;
      let hasMore = true;
      const videoBatchSize = 20;

      while (hasMore) {
        const videoList = await client.getVideoList(
          data.accessToken,
          openId,
          cursor,
          videoBatchSize,
        ) as any;

        const videoItems = videoList?.data?.videos || [];

        for (const v of videoItems) {
          await db.insert(videos).values({
            id: v.video_id || `${openId}_${v.create_time}`,
            productId: v.product_id || openId,
            creatorId: openId,
            title: v.title || '',
            thumbnailUrl: v.cover_url || null,
            duration: v.duration || 0,
            likeCount: v.like_count || 0,
            shareCount: v.share_count || 0,
            viewCount: v.view_count || 0,
            publishedAt: new Date(v.create_time || Date.now()),
          }).onConflictDoNothing();

          totalVideos++;
        }

        cursor = videoList?.data?.cursor;
        hasMore = videoItems.length === videoBatchSize && !!cursor;
        // Rate limiting pause between batches
        await new Promise((r) => setTimeout(r, 500));
      }

      // Rate limiting pause between creators
      await new Promise((r) => setTimeout(r, 1000));
    } catch (error) {
      console.error(`Failed to ingest creator ${openId}:`, error);
    }
  }

  console.log(`Ingested ${totalIngested} creators with ${totalVideos} videos`);
  return { creators: totalIngested, videos: totalVideos };
}
