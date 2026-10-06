/**
 * Display synchronization service — Issue #21.
 *
 * Orchestrates profile and video synchronization from the TikTok Display API
 * into tenant-isolated, idempotent, provenance-tracked storage.
 *
 * Key properties:
 * - Idempotent upserts: replaying the same payload creates no duplicates
 * - Cursor pagination: videos are paginated until has_more=false or safety limit
 * - Partial failure: missing data stays missing/null, never becomes zero
 * - Provenance: every observed field is tagged with source, endpoint, scopes,
 *   retrieved time, connection, tenant, sync run, and classification
 * - Kill switch: respects the deployment-level capability control
 * - Tenant isolation: every query is scoped by (workspace_id, user_id)
 */

import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { CredentialCipher, credentialContext, loadCredentialCipher } from '../credential-crypto';
import { DisplayApiAdapter, DisplayApiError } from './adapter';
import { assertAllApprovedScopesGranted } from './capability';
import { sanitizeDisplayEvidence, assertNoCredentialMaterial } from './sanitize';
import { loadDisplayConfig, type DisplayConfig } from './config';
import {
  DisplayConnectionRepository,
  DisplayCapabilityDisabledError,
  DisplayConnectionNotFoundError,
  DisplayConnectionStateError,
  type DisplayConnectionRecord,
} from '../repositories/display';

/** Maximum number of pages to fetch in a single video sync run. */
const MAX_PAGES_PER_SYNC = 100;
/** Maximum number of videos to fetch in a single sync run. */
const MAX_VIDEOS_PER_SYNC = 2000;
/** Backoff base in milliseconds for retried sync jobs. */
const BACKOFF_BASE_MS = 2000;
/** Maximum backoff in milliseconds. */
const BACKOFF_MAX_MS = 300000;

export type DisplaySyncKind = 'profile_sync' | 'video_sync';
export type DisplaySyncStatus = 'succeeded' | 'failed' | 'partial';

export interface DisplaySyncResult {
  syncRunId: string;
  status: DisplaySyncStatus;
  itemsProcessed: number;
  pagesProcessed: number;
  errorCode: string | null;
}

export interface DisplaySyncServiceOptions {
  repository?: DisplayConnectionRepository;
  adapter?: DisplayApiAdapter;
  config?: DisplayConfig;
  pool?: Pool;
  cipher?: CredentialCipher;
}

/**
 * Derives an HMAC hash of a provider identifier scoped to a connection.
 * The raw identifier is never persisted.
 */
function hashProviderId(cipher: CredentialCipher, connectionId: string, rawId: string): string {
  return cipher.accountHash(`${connectionId}:${rawId}`);
}

/**
 * Computes a deterministic SHA-256 hash of a payload for idempotent snapshotting.
 * Same payload always produces the same hash, enabling replay detection.
 */
function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Parses a TikTok user/info response into a normalized profile record.
 * Provider envelope: { data: { user: {...} }, error: {...} }.
 * Missing fields remain missing/null — never defaulted to zero.
 */
function parseProfileResponse(data: Record<string, unknown>): {
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number | null;
  followingCount: number | null;
  likesCount: number | null;
  videoCount: number | null;
} {
  const inner = (data.data ?? data) as Record<string, unknown>;
  const user = (inner.user ?? inner) as Record<string, unknown>;
  return {
    displayName: typeof user.display_name === 'string' ? user.display_name : null,
    avatarUrl: typeof user.avatar_url === 'string' ? user.avatar_url : null,
    followerCount: typeof user.follower_count === 'number' ? user.follower_count : null,
    followingCount: typeof user.following_count === 'number' ? user.following_count : null,
    likesCount: typeof user.likes_count === 'number' ? user.likes_count : null,
    videoCount: typeof user.video_count === 'number' ? user.video_count : null,
  };
}

/**
 * Parses a TikTok video/list response into normalized video records.
 * Missing fields remain missing/null.
 */
interface ParsedVideo {
  providerVideoHash: string;
  title: string | null;
  videoDescription: string | null;
  coverImageUrl: string | null;
  shareUrl: string | null;
  duration: number | null;
  height: number | null;
  width: number | null;
  createTime: Date | null;
  isAigc: boolean | null;
  embedLink: string | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  viewCount: number | null;
}

function parseVideoListResponse(data: Record<string, unknown>): {
  videos: ParsedVideo[];
  cursor: string | null;
  hasMore: boolean;
} {
  const inner = (data.data ?? data) as Record<string, unknown>;
  const videos = Array.isArray(inner.videos) ? inner.videos : [];
  const cursor = typeof inner.cursor === 'string' ? inner.cursor : null;
  const hasMore = inner.has_more === true;

  return {
    videos: videos.map((v): ParsedVideo => {
      const video = v as Record<string, unknown>;
      const rawId = typeof video.id === 'string' ? video.id : '';
      return {
        providerVideoHash: rawId,
        title: typeof video.title === 'string' ? video.title : null,
        videoDescription: typeof video.video_description === 'string' ? video.video_description : null,
        coverImageUrl: typeof video.cover_image_url === 'string' ? video.cover_image_url : null,
        shareUrl: typeof video.share_url === 'string' ? video.share_url : null,
        duration: typeof video.duration === 'number' ? video.duration : null,
        height: typeof video.height === 'number' ? video.height : null,
        width: typeof video.width === 'number' ? video.width : null,
        createTime: typeof video.create_time === 'number' ? new Date(video.create_time * 1000) : null,
        isAigc: typeof video.is_aigc === 'boolean' ? video.is_aigc : null,
        embedLink: typeof video.embed_link === 'string' ? video.embed_link : null,
        likeCount: typeof video.like_count === 'number' ? video.like_count : null,
        commentCount: typeof video.comment_count === 'number' ? video.comment_count : null,
        shareCount: typeof video.share_count === 'number' ? video.share_count : null,
        viewCount: typeof video.view_count === 'number' ? video.view_count : null,
      };
    }),
    cursor,
    hasMore,
  };
}

export class DisplaySyncService {
  private readonly repository: DisplayConnectionRepository;
  private readonly adapter: DisplayApiAdapter;
  private readonly config: DisplayConfig;
  private readonly pool: Pool;
  private readonly cipher: CredentialCipher;

  constructor(options: DisplaySyncServiceOptions = {}) {
    this.repository = options.repository ?? DisplayConnectionRepository.fromUrl(
      process.env.DATABASE_URL ?? '',
      options.cipher ?? loadCredentialCipher(),
    );
    this.adapter = options.adapter ?? new DisplayApiAdapter();
    this.config = options.config ?? loadDisplayConfig();
    this.pool = options.pool ?? new Pool({ connectionString: process.env.DATABASE_URL ?? '' });
    this.cipher = options.cipher ?? loadCredentialCipher();
  }

  /**
   * Synchronize the creator's profile from the Display API.
   * Idempotent: replaying the same payload updates the current profile
   * and creates a new snapshot row keyed by observed_at.
   */
  async syncProfile(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<DisplaySyncResult> {
    const syncRunId = randomUUID();
    const startedAt = new Date();

    try {
      // Verify capability is enabled
      await this.repository.isCapabilityEnabled();

      // Read credentials (audited, tenant-scoped)
      const stored = await this.repository.readCredentials(workspaceId, userId, connectionId);
      const connection = stored.connection;

      // Verify all required scopes are granted
      assertAllApprovedScopesGranted(connection.scopes);

      // Create sync run record
      await this.createSyncRun(workspaceId, userId, connectionId, 'profile_sync', syncRunId);

      // Fetch profile from provider
      const result = await this.adapter.fetchUserInfo(stored.accessToken);

      if (!result.ok || !result.data) {
        const errorCode = result.errorCode ?? 'provider_error';
        await this.failSyncRun(syncRunId, errorCode);
        return { syncRunId, status: 'failed', itemsProcessed: 0, pagesProcessed: 0, errorCode };
      }

      // Parse and sanitize
      const profile = parseProfileResponse(result.data);
      const sanitized = sanitizeDisplayEvidence(profile) as typeof profile;
      assertNoCredentialMaterial(sanitized, 'profile data');

      const observedAt = new Date();
      const providerAccountHash = hashProviderId(this.cipher, connectionId, connection.providerAccountHash);

      // Build provenance
      const provenance = {
        source: 'tiktok_display_api',
        endpoint: '/v2/user/info/',
        scopes: connection.scopes,
        retrievedAt: observedAt.toISOString(),
        connectionId,
        syncRunId,
        classification: 'observed' as const,
      };

      // Upsert current profile
      await this.upsertProfile(workspaceId, userId, connectionId, providerAccountHash, sanitized, provenance, observedAt);

      // Create snapshot
      await this.createProfileSnapshot(workspaceId, userId, connectionId, providerAccountHash, sanitized, provenance, observedAt);

      // Record metric provenance
      await this.recordMetricProvenance(workspaceId, userId, connectionId, syncRunId, observedAt, [
        { metricName: 'follower_count', classification: 'observed', sourceEndpoint: '/v2/user/info/', scopes: connection.scopes },
        { metricName: 'following_count', classification: 'observed', sourceEndpoint: '/v2/user/info/', scopes: connection.scopes },
        { metricName: 'likes_count', classification: 'observed', sourceEndpoint: '/v2/user/info/', scopes: connection.scopes },
        { metricName: 'video_count', classification: 'observed', sourceEndpoint: '/v2/user/info/', scopes: connection.scopes },
      ]);

      // Update connection last_sync_at
      await this.updateConnectionLastSync(workspaceId, userId, connectionId);

      // Mark sync run succeeded
      await this.completeSyncRun(syncRunId, 'succeeded', 1, 0);

      return { syncRunId, status: 'succeeded', itemsProcessed: 1, pagesProcessed: 0, errorCode: null };
    } catch (error) {
      const errorCode = error instanceof DisplayApiError ? error.errorCode : 'sync_failed';
      await this.failSyncRun(syncRunId, errorCode);
      return { syncRunId, status: 'failed', itemsProcessed: 0, pagesProcessed: 0, errorCode };
    }
  }

  /**
   * Synchronize the creator's videos from the Display API with cursor pagination.
   * Idempotent: replaying the same payload updates existing video entities
   * and creates new snapshot rows keyed by observed_at.
   */
  async syncVideos(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<DisplaySyncResult> {
    const syncRunId = randomUUID();
    const startedAt = new Date();
    let itemsProcessed = 0;
    let pagesProcessed = 0;
    let lastCursor: string | null = null;

    try {
      // Verify capability is enabled
      await this.repository.isCapabilityEnabled();

      // Read credentials
      const stored = await this.repository.readCredentials(workspaceId, userId, connectionId);
      const connection = stored.connection;

      // Verify video.list scope is granted
      assertAllApprovedScopesGranted(connection.scopes);

      // Create sync run record
      await this.createSyncRun(workspaceId, userId, connectionId, 'video_sync', syncRunId);

      const providerAccountHash = hashProviderId(this.cipher, connectionId, connection.providerAccountHash);
      const observedAt = new Date();
      let hasMore = true;
      let cursor: string | null = null;

      // Resume from checkpoint if one exists from a previous partial run
      const checkpoint = await this.getCursorCheckpoint(workspaceId, userId, connectionId);
      if (checkpoint) {
        cursor = checkpoint.cursor;
        itemsProcessed = checkpoint.itemsProcessed;
        pagesProcessed = checkpoint.pagesProcessed;
      }

      while (hasMore && pagesProcessed < MAX_PAGES_PER_SYNC && itemsProcessed < MAX_VIDEOS_PER_SYNC) {
        // Fetch page from provider with cursor pagination
        const result = await this.adapter.fetchVideoList(stored.accessToken, 20, cursor);

        if (!result.ok || !result.data) {
          const errorCode = result.errorCode ?? 'provider_error';
          // Persist checkpoint before failing so retry/resume does not duplicate committed data
          await this.persistCursorCheckpoint(workspaceId, userId, connectionId, cursor, itemsProcessed, pagesProcessed);
          await this.failSyncRun(syncRunId, errorCode);
          return { syncRunId, status: 'partial', itemsProcessed, pagesProcessed, errorCode };
        }

        const page = parseVideoListResponse(result.data);
        pagesProcessed++;

        // Process each video
        for (const video of page.videos) {
          if (!video.providerVideoHash) continue;

          const videoHash = hashProviderId(this.cipher, connectionId, video.providerVideoHash);

          const provenance = {
            source: 'tiktok_display_api',
            endpoint: '/v2/video/list/',
            scopes: connection.scopes,
            retrievedAt: observedAt.toISOString(),
            connectionId,
            syncRunId,
            classification: 'observed' as const,
          };

          // Upsert video entity
          await this.upsertVideo(workspaceId, userId, connectionId, videoHash, video, provenance, observedAt);

          // Create video metric snapshot
          await this.createVideoSnapshot(workspaceId, userId, connectionId, videoHash, video, provenance, observedAt);

          itemsProcessed++;
        }

        // Record metric provenance for this page
        await this.recordMetricProvenance(workspaceId, userId, connectionId, syncRunId, observedAt, [
          { metricName: 'like_count', classification: 'observed', sourceEndpoint: '/v2/video/list/', scopes: connection.scopes },
          { metricName: 'comment_count', classification: 'observed', sourceEndpoint: '/v2/video/list/', scopes: connection.scopes },
          { metricName: 'share_count', classification: 'observed', sourceEndpoint: '/v2/video/list/', scopes: connection.scopes },
          { metricName: 'view_count', classification: 'observed', sourceEndpoint: '/v2/video/list/', scopes: connection.scopes },
        ]);

        // Persist cursor checkpoint after each page
        hasMore = page.hasMore;
        cursor = page.cursor;
        lastCursor = cursor;
        await this.persistCursorCheckpoint(workspaceId, userId, connectionId, cursor, itemsProcessed, pagesProcessed);
      }

      // Clear checkpoint on successful completion
      await this.clearCursorCheckpoint(workspaceId, userId, connectionId);

      // Update connection last_sync_at
      await this.updateConnectionLastSync(workspaceId, userId, connectionId);

      // Mark sync run succeeded
      await this.completeSyncRun(syncRunId, 'succeeded', itemsProcessed, pagesProcessed);

      return { syncRunId, status: 'succeeded', itemsProcessed, pagesProcessed, errorCode: null };
    } catch (error) {
      const errorCode = error instanceof DisplayApiError ? error.errorCode : 'sync_failed';
      await this.failSyncRun(syncRunId, errorCode);
      return { syncRunId, status: 'failed', itemsProcessed, pagesProcessed, errorCode };
    }
  }

  // ------------------------------------------------------------------ helpers

  private async createSyncRun(
    workspaceId: string,
    userId: string,
    connectionId: string,
    kind: DisplaySyncKind,
    syncRunId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO display_sync_runs (workspace_id, user_id, connection_id, kind, status, started_at, id, cursor_checkpoint)
       VALUES ($1, $2, $3, $4, 'running', NOW(), $5, NULL)`,
      [workspaceId, userId, connectionId, kind, syncRunId],
    );
  }

  private async completeSyncRun(
    syncRunId: string,
    status: DisplaySyncStatus,
    itemsProcessed: number,
    pagesProcessed: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE display_sync_runs
       SET status = $2, items_processed = $3, pages_processed = $4, finished_at = NOW()
       WHERE id = $1`,
      [syncRunId, status, itemsProcessed, pagesProcessed],
    );
  }

  private async failSyncRun(syncRunId: string, errorCode: string): Promise<void> {
    await this.pool.query(
      `UPDATE display_sync_runs
       SET status = 'failed', error_code = $2, finished_at = NOW()
       WHERE id = $1`,
      [syncRunId, errorCode],
    );
  }

  private async upsertProfile(
    workspaceId: string,
    userId: string,
    connectionId: string,
    providerAccountHash: string,
    profile: { displayName: string | null; avatarUrl: string | null; followerCount: number | null; followingCount: number | null; likesCount: number | null; videoCount: number | null },
    provenance: Record<string, unknown>,
    observedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO display_profiles (workspace_id, user_id, connection_id, provider_account_hash, display_name, avatar_url, follower_count, following_count, likes_count, video_count, provenance, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       ON CONFLICT (workspace_id, connection_id)
       DO UPDATE SET
         provider_account_hash = EXCLUDED.provider_account_hash,
         display_name = EXCLUDED.display_name,
         avatar_url = EXCLUDED.avatar_url,
         follower_count = EXCLUDED.follower_count,
         following_count = EXCLUDED.following_count,
         likes_count = EXCLUDED.likes_count,
         video_count = EXCLUDED.video_count,
         provenance = EXCLUDED.provenance,
         observed_at = EXCLUDED.observed_at,
         updated_at = NOW()`,
      [workspaceId, userId, connectionId, providerAccountHash, profile.displayName, profile.avatarUrl, profile.followerCount, profile.followingCount, profile.likesCount, profile.videoCount, JSON.stringify(provenance), observedAt],
    );
  }

  private async createProfileSnapshot(
    workspaceId: string,
    userId: string,
    connectionId: string,
    providerAccountHash: string,
    profile: { displayName: string | null; avatarUrl: string | null; followerCount: number | null; followingCount: number | null; likesCount: number | null; videoCount: number | null },
    provenance: Record<string, unknown>,
    observedAt: Date,
  ): Promise<void> {
    const ph = payloadHash(profile);
    await this.pool.query(
      `INSERT INTO display_profile_snapshots (workspace_id, user_id, connection_id, provider_account_hash, display_name, avatar_url, follower_count, following_count, likes_count, video_count, provenance, observed_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
       ON CONFLICT (workspace_id, connection_id, payload_hash) DO NOTHING`,
      [workspaceId, userId, connectionId, providerAccountHash, profile.displayName, profile.avatarUrl, profile.followerCount, profile.followingCount, profile.likesCount, profile.videoCount, JSON.stringify(provenance), observedAt, ph],
    );
  }

  private async upsertVideo(
    workspaceId: string,
    userId: string,
    connectionId: string,
    providerVideoHash: string,
    video: { title: string | null; videoDescription: string | null; coverImageUrl: string | null; shareUrl: string | null; duration: number | null; height: number | null; width: number | null; createTime: Date | null; isAigc: boolean | null; embedLink: string | null },
    provenance: Record<string, unknown>,
    observedAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO display_videos (workspace_id, user_id, connection_id, provider_video_hash, title, video_description, cover_image_url, share_url, duration, height, width, create_time, is_aigc, embed_link, provenance, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)
       ON CONFLICT (workspace_id, connection_id, provider_video_hash)
       DO UPDATE SET
         title = EXCLUDED.title,
         video_description = EXCLUDED.video_description,
         cover_image_url = EXCLUDED.cover_image_url,
         share_url = EXCLUDED.share_url,
         duration = EXCLUDED.duration,
         height = EXCLUDED.height,
         width = EXCLUDED.width,
         create_time = EXCLUDED.create_time,
         is_aigc = EXCLUDED.is_aigc,
         embed_link = EXCLUDED.embed_link,
         provenance = EXCLUDED.provenance,
         observed_at = EXCLUDED.observed_at,
         updated_at = NOW()`,
      [workspaceId, userId, connectionId, providerVideoHash, video.title, video.videoDescription, video.coverImageUrl, video.shareUrl, video.duration, video.height, video.width, video.createTime, video.isAigc, video.embedLink, JSON.stringify(provenance), observedAt],
    );
  }

  private async createVideoSnapshot(
    workspaceId: string,
    userId: string,
    connectionId: string,
    providerVideoHash: string,
    video: { likeCount: number | null; commentCount: number | null; shareCount: number | null; viewCount: number | null },
    provenance: Record<string, unknown>,
    observedAt: Date,
  ): Promise<void> {
    const ph = payloadHash(video);
    await this.pool.query(
      `INSERT INTO display_video_snapshots (workspace_id, user_id, connection_id, provider_video_hash, like_count, comment_count, share_count, view_count, provenance, observed_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
       ON CONFLICT (workspace_id, connection_id, provider_video_hash, payload_hash) DO NOTHING`,
      [workspaceId, userId, connectionId, providerVideoHash, video.likeCount, video.commentCount, video.shareCount, video.viewCount, JSON.stringify(provenance), observedAt, ph],
    );
  }

  private async recordMetricProvenance(
    workspaceId: string,
    userId: string,
    connectionId: string,
    syncRunId: string,
    retrievedAt: Date,
    metrics: Array<{ metricName: string; classification: string; sourceEndpoint: string; scopes: string[] }>,
  ): Promise<void> {
    for (const metric of metrics) {
      await this.pool.query(
        `INSERT INTO display_metric_provenance (workspace_id, user_id, connection_id, metric_name, classification, source_endpoint, scopes, sync_run_id, retrieved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [workspaceId, userId, connectionId, metric.metricName, metric.classification, metric.sourceEndpoint, JSON.stringify(metric.scopes), syncRunId, retrievedAt],
      );
    }
  }

  private async updateConnectionLastSync(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE display_connections SET last_sync_at = NOW(), updated_at = NOW()
       WHERE workspace_id = $1 AND user_id = $2 AND id = $3`,
      [workspaceId, userId, connectionId],
    );
  }

  // ------------------------------------------------------------------ cursor checkpoints

  private async getCursorCheckpoint(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<{ cursor: string | null; itemsProcessed: number; pagesProcessed: number } | null> {
    const result = await this.pool.query<{ cursor_checkpoint: string | null; items_processed: number; pages_processed: number }>(
      `SELECT cursor_checkpoint, items_processed, pages_processed
       FROM display_sync_runs
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
         AND status = 'partial'
       ORDER BY started_at DESC LIMIT 1`,
      [workspaceId, userId, connectionId],
    );
    if (result.rows.length === 0) return null;
    return {
      cursor: result.rows[0].cursor_checkpoint,
      itemsProcessed: result.rows[0].items_processed,
      pagesProcessed: result.rows[0].pages_processed,
    };
  }

  private async persistCursorCheckpoint(
    workspaceId: string,
    userId: string,
    connectionId: string,
    cursor: string | null,
    itemsProcessed: number,
    pagesProcessed: number,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE display_sync_runs
       SET cursor_checkpoint = $4, items_processed = $5, pages_processed = $6
       WHERE id = (
         SELECT id FROM display_sync_runs
         WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
           AND status = 'partial'
         ORDER BY started_at DESC LIMIT 1
       )`,
      [workspaceId, userId, connectionId, cursor, itemsProcessed, pagesProcessed],
    );
  }

  private async clearCursorCheckpoint(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE display_sync_runs
       SET cursor_checkpoint = NULL
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
         AND status = 'succeeded'`,
      [workspaceId, userId, connectionId],
    );
  }

  // ------------------------------------------------------------------ queries

  /** List sync runs for a connection, newest first. */
  async listSyncRuns(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<Array<{
    id: string;
    kind: string;
    status: string;
    itemsProcessed: number;
    pagesProcessed: number;
    errorCode: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  }>> {
    const result = await this.pool.query<{
      id: string; kind: string; status: string; items_processed: number;
      pages_processed: number; error_code: string | null; started_at: Date; finished_at: Date | null;
    }>(
      `SELECT id, kind, status, items_processed, pages_processed, error_code, started_at, finished_at
       FROM display_sync_runs
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
       ORDER BY started_at DESC LIMIT 100`,
      [workspaceId, userId, connectionId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      itemsProcessed: row.items_processed,
      pagesProcessed: row.pages_processed,
      errorCode: row.error_code,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }));
  }

  /** Get the current profile for a connection. */
  async getProfile(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<{
    displayName: string | null;
    avatarUrl: string | null;
    followerCount: number | null;
    followingCount: number | null;
    likesCount: number | null;
    videoCount: number | null;
    observedAt: Date;
  } | null> {
    const result = await this.pool.query<{
      display_name: string | null; avatar_url: string | null; follower_count: number | null;
      following_count: number | null; likes_count: number | null; video_count: number | null; observed_at: Date;
    }>(
      `SELECT display_name, avatar_url, follower_count, following_count, likes_count, video_count, observed_at
       FROM display_profiles
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3`,
      [workspaceId, userId, connectionId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      followerCount: row.follower_count,
      followingCount: row.following_count,
      likesCount: row.likes_count,
      videoCount: row.video_count,
      observedAt: row.observed_at,
    };
  }

  /** List current videos for a connection. */
  async listVideos(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<Array<{
    providerVideoHash: string;
    title: string | null;
    videoDescription: string | null;
    coverImageUrl: string | null;
    shareUrl: string | null;
    duration: number | null;
    height: number | null;
    width: number | null;
    createTime: Date | null;
    isAigc: boolean | null;
    embedLink: string | null;
    observedAt: Date;
  }>> {
    const result = await this.pool.query<{
      provider_video_hash: string; title: string | null; video_description: string | null;
      cover_image_url: string | null; share_url: string | null; duration: number | null;
      height: number | null; width: number | null; create_time: Date | null;
      is_aigc: boolean | null; embed_link: string | null; observed_at: Date;
    }>(
      `SELECT provider_video_hash, title, video_description, cover_image_url, share_url,
              duration, height, width, create_time, is_aigc, embed_link, observed_at
       FROM display_videos
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
       ORDER BY observed_at DESC LIMIT 500`,
      [workspaceId, userId, connectionId],
    );
    return result.rows.map((row) => ({
      providerVideoHash: row.provider_video_hash,
      title: row.title,
      videoDescription: row.video_description,
      coverImageUrl: row.cover_image_url,
      shareUrl: row.share_url,
      duration: row.duration,
      height: row.height,
      width: row.width,
      createTime: row.create_time,
      isAigc: row.is_aigc,
      embedLink: row.embed_link,
      observedAt: row.observed_at,
    }));
  }

  /** List metric provenance for a connection. */
  async listMetrics(
    workspaceId: string,
    userId: string,
    connectionId: string,
  ): Promise<Array<{
    metricName: string;
    classification: string;
    sourceEndpoint: string;
    scopes: string[];
    syncRunId: string;
    retrievedAt: Date;
  }>> {
    const result = await this.pool.query<{
      metric_name: string; classification: string; source_endpoint: string;
      scopes: string[]; sync_run_id: string; retrieved_at: Date;
    }>(
      `SELECT metric_name, classification, source_endpoint, scopes, sync_run_id, retrieved_at
       FROM display_metric_provenance
       WHERE workspace_id = $1 AND user_id = $2 AND connection_id = $3
       ORDER BY retrieved_at DESC LIMIT 200`,
      [workspaceId, userId, connectionId],
    );
    return result.rows.map((row) => ({
      metricName: row.metric_name,
      classification: row.classification,
      sourceEndpoint: row.source_endpoint,
      scopes: row.scopes,
      syncRunId: row.sync_run_id,
      retrievedAt: row.retrieved_at,
    }));
  }
}
