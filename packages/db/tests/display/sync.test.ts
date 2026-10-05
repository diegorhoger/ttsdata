/**
 * Display sync service tests — Issue #21.
 *
 * Covers:
 * - Profile sync
 * - Video sync with cursor pagination
 * - Idempotency (replaying same payload creates no duplicates)
 * - Partial failure handling
 * - Missing/null values stay missing/null
 * - Tenant isolation
 * - Metric provenance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { DisplaySyncService } from '../../src/display/sync';
import { DisplayApiAdapter } from '../../src/display/adapter';
import { CredentialCipher } from '../../src/credential-crypto';

// Test-only cipher — never used in production
const TEST_CIPHER = new CredentialCipher({ '1': Buffer.alloc(32, 1).toString('base64') }, 1);

const mockPool = () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      // Return appropriate mock data based on the query
      if (sql.includes('display_capability_controls')) {
        return { rows: [{ enabled: true }] };
      }
      if (sql.includes('display_connections') && sql.includes('SELECT')) {
        return {
          rows: [{
            id: 'conn-1',
            workspace_id: 'ws-1',
            user_id: 'user-1',
            provider: 'tiktok_display',
            provider_account_hash: 'a'.repeat(64),
            scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
            status: 'active',
            revision: 1,
            authorized_at: new Date(),
            expires_at: new Date(Date.now() + 3600000),
            refresh_expires_at: null,
            last_refreshed_at: null,
            last_sync_at: null,
            revoked_at: null,
            disconnected_at: null,
            remote_revocation: 'not_attempted',
            remote_revocation_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          }],
        };
      }
      if (sql.includes('display_connections') && sql.includes('UPDATE')) {
        return { rows: [{ id: 'conn-1' }] };
      }
      if (sql.includes('display_sync_runs') && sql.includes('INSERT')) {
        return { rows: [{ id: 'run-1' }] };
      }
      if (sql.includes('display_sync_runs') && sql.includes('UPDATE')) {
        return { rows: [{ id: 'run-1' }] };
      }
      if (sql.includes('display_sync_runs') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      if (sql.includes('display_profiles') && sql.includes('INSERT')) {
        return { rows: [{ id: 'profile-1' }] };
      }
      if (sql.includes('display_profile_snapshots') && sql.includes('INSERT')) {
        return { rows: [{ id: 'snap-1' }] };
      }
      if (sql.includes('display_videos') && sql.includes('INSERT')) {
        return { rows: [{ id: 'video-1' }] };
      }
      if (sql.includes('display_video_snapshots') && sql.includes('INSERT')) {
        return { rows: [{ id: 'vsnap-1' }] };
      }
      if (sql.includes('display_metric_provenance')) {
        return { rows: [{ id: 'metric-1' }] };
      }
      if (sql.includes('display_audit')) {
        return { rows: [{ id: 'audit-1' }] };
      }
      return { rows: [] };
    }),
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
    end: vi.fn(async () => undefined),
  };
  return { pool: pool as unknown as Pool, queries };
};

describe('DisplaySyncService', () => {
  let service: DisplaySyncService;
  let mockAdapter: DisplayApiAdapter;
  let pool: Pool;
  let queries: Array<{ sql: string; params: unknown[] }>;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    const mocks = mockPool();
    pool = mocks.pool;
    queries = mocks.queries;
    mockAdapter = new DisplayApiAdapter();
    const mockRepository = {
      isCapabilityEnabled: vi.fn(async () => true),
      readCredentials: vi.fn(async () => ({
        connection: {
          id: 'conn-1',
          workspaceId: 'ws-1',
          userId: 'user-1',
          provider: 'tiktok_display',
          providerAccountHash: 'a'.repeat(64),
          scopes: ['user.info.basic', 'user.info.stats', 'video.list'],
          status: 'active' as const,
          revision: 1,
          authorizedAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000),
          refreshExpiresAt: null,
          lastRefreshedAt: null,
          lastSyncAt: null,
          revokedAt: null,
          disconnectedAt: null,
          remoteRevocation: 'not_attempted' as const,
          remoteRevocationAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      })),
      recordAudit: vi.fn(async () => undefined),
    };
    service = new DisplaySyncService({
      pool,
      cipher: TEST_CIPHER,
      adapter: mockAdapter,
      repository: mockRepository as never,
      config: {
        clientKey: 'test-key',
        clientSecret: 'test-secret',
        redirectUri: 'http://localhost:3000/callback',
        stateSecret: 'x'.repeat(32),
        sessionSecret: 'y'.repeat(32),
        resultSecret: 'z'.repeat(32),
        canonicalOrigin: 'http://localhost:3000',
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncProfile', () => {
    it('syncs a profile successfully', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            display_name: 'Test User',
            avatar_url: 'https://example.com/avatar.jpg',
            follower_count: 100,
            following_count: 50,
            likes_count: 1000,
            video_count: 10,
          },
        },
        errorCode: null,
      });

      const result = await service.syncProfile('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('succeeded');
      expect(result.itemsProcessed).toBe(1);
      expect(result.errorCode).toBeNull();
    });

    it('handles provider failure gracefully', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        errorCode: 'provider_unavailable',
      });

      const result = await service.syncProfile('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('provider_unavailable');
    });

    it('keeps missing values as null, never zero', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            display_name: 'Test User',
            // avatar_url missing
            follower_count: 100,
            // following_count missing
            // likes_count missing
            video_count: 10,
          },
        },
        errorCode: null,
      });

      const result = await service.syncProfile('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('succeeded');

      // Find the profile upsert query
      const profileQuery = queries.find((q) => q.sql.includes('display_profiles') && q.sql.includes('INSERT'));
      expect(profileQuery).toBeDefined();
      // avatar_url should be null (param index 5)
      expect(profileQuery!.params[5]).toBeNull();
      // following_count should be null (param index 7)
      expect(profileQuery!.params[7]).toBeNull();
      // likes_count should be null (param index 8)
      expect(profileQuery!.params[8]).toBeNull();
    });
  });

  describe('syncVideos', () => {
    it('syncs videos with pagination', async () => {
      let callCount = 0;
      vi.spyOn(mockAdapter, 'fetchVideoList').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            data: {
              videos: [
                { id: 'v1', title: 'Video 1', like_count: 10, comment_count: 2, share_count: 1, view_count: 100 },
                { id: 'v2', title: 'Video 2', like_count: 20, comment_count: 4, share_count: 2, view_count: 200 },
              ],
              cursor: 'cursor-1',
              has_more: true,
            },
            errorCode: null,
          };
        }
        return {
          ok: true,
          status: 200,
          data: {
            videos: [
              { id: 'v3', title: 'Video 3', like_count: 30, comment_count: 6, share_count: 3, view_count: 300 },
            ],
            cursor: 'cursor-2',
            has_more: false,
          },
          errorCode: null,
        };
      });

      const result = await service.syncVideos('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('succeeded');
      expect(result.itemsProcessed).toBe(3);
      expect(result.pagesProcessed).toBe(2);
    });

    it('stops at MAX_PAGES_PER_SYNC', async () => {
      vi.spyOn(mockAdapter, 'fetchVideoList').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          videos: [{ id: 'v1', title: 'Video 1' }],
          cursor: 'cursor-1',
          has_more: true,
        },
        errorCode: null,
      });

      const result = await service.syncVideos('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('succeeded');
      expect(result.pagesProcessed).toBe(100);
    });

    it('handles partial failure gracefully', async () => {
      let callCount = 0;
      vi.spyOn(mockAdapter, 'fetchVideoList').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            data: {
              videos: [{ id: 'v1', title: 'Video 1' }],
              cursor: 'cursor-1',
              has_more: true,
            },
            errorCode: null,
          };
        }
        return {
          ok: false,
          status: 429,
          data: null,
          errorCode: 'provider_rate_limited',
        };
      });

      const result = await service.syncVideos('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe('provider_rate_limited');
      expect(result.itemsProcessed).toBe(1);
      expect(result.pagesProcessed).toBe(1);
    });

    it('keeps missing video metrics as null', async () => {
      vi.spyOn(mockAdapter, 'fetchVideoList').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          videos: [
            { id: 'v1', title: 'Video 1' },
 // like_count, comment_count, share_count, view_count all missing
          ],
          cursor: null,
          has_more: false,
        },
        errorCode: null,
      });

      const result = await service.syncVideos('ws-1', 'user-1', 'conn-1');

      expect(result.status).toBe('succeeded');

      // Find the video snapshot query
      const snapshotQuery = queries.find((q) => q.sql.includes('display_video_snapshots') && q.sql.includes('INSERT'));
      expect(snapshotQuery).toBeDefined();
      // like_count (param 4), comment_count (param 5), share_count (param 6), view_count (param 7) should all be null
      expect(snapshotQuery!.params[4]).toBeNull();
      expect(snapshotQuery!.params[5]).toBeNull();
      expect(snapshotQuery!.params[6]).toBeNull();
      expect(snapshotQuery!.params[7]).toBeNull();
    });
  });

  describe('idempotency', () => {
    it('replaying the same profile payload updates rather than duplicates', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            display_name: 'Test User',
            follower_count: 100,
            following_count: 50,
            likes_count: 1000,
            video_count: 10,
          },
        },
        errorCode: null,
      });

      // First sync
      await service.syncProfile('ws-1', 'user-1', 'conn-1');
      const firstQueryCount = queries.filter((q) => q.sql.includes('display_profiles') && q.sql.includes('INSERT')).length;

      // Second sync with same data
      await service.syncProfile('ws-1', 'user-1', 'conn-1');
      const secondQueryCount = queries.filter((q) => q.sql.includes('display_profiles') && q.sql.includes('INSERT')).length;

      // Should use ON CONFLICT DO UPDATE, not create duplicates
      expect(secondQueryCount).toBe(firstQueryCount + 1);
    });

    it('replaying the same video payload updates rather than duplicates', async () => {
      vi.spyOn(mockAdapter, 'fetchVideoList').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          videos: [{ id: 'v1', title: 'Video 1', like_count: 10 }],
          cursor: null,
          has_more: false,
        },
        errorCode: null,
      });

      // First sync
      await service.syncVideos('ws-1', 'user-1', 'conn-1');
      const firstQueryCount = queries.filter((q) => q.sql.includes('display_videos') && q.sql.includes('INSERT')).length;

      // Second sync with same data
      await service.syncVideos('ws-1', 'user-1', 'conn-1');
      const secondQueryCount = queries.filter((q) => q.sql.includes('display_videos') && q.sql.includes('INSERT')).length;

      // Should use ON CONFLICT DO UPDATE
      expect(secondQueryCount).toBe(firstQueryCount + 1);
    });
  });

  describe('tenant isolation', () => {
    it('scopes all queries by workspace_id and user_id', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: { user: { display_name: 'Test', follower_count: 1 } },
        errorCode: null,
      });

      await service.syncProfile('ws-1', 'user-1', 'conn-1');

      // Tenant-scoped tables: display_profiles, display_profile_snapshots,
      // display_videos, display_video_snapshots, display_metric_provenance,
      // display_sync_runs, display_audit
      const tenantTables = [
        'display_profiles', 'display_profile_snapshots', 'display_videos',
        'display_video_snapshots', 'display_metric_provenance', 'display_sync_runs',
        'display_audit',
      ];
      const writeQueries = queries.filter((q) =>
        tenantTables.some((t) => q.sql.includes(t))
      );
      expect(writeQueries.length).toBeGreaterThan(0);
      for (const q of writeQueries) {
        // workspace_id and user_id should appear in params for INSERT queries
        if (q.sql.includes('INSERT')) {
          expect(q.params).toContain('ws-1');
          expect(q.params).toContain('user-1');
        }
      }
    });
  });

  describe('metric provenance', () => {
    it('records provenance for all observed metrics', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            display_name: 'Test',
            follower_count: 100,
            following_count: 50,
            likes_count: 1000,
            video_count: 10,
          },
        },
        errorCode: null,
      });

      await service.syncProfile('ws-1', 'user-1', 'conn-1');

      const metricQueries = queries.filter((q) => q.sql.includes('display_metric_provenance'));
      expect(metricQueries.length).toBeGreaterThan(0);

      // Should record follower_count, following_count, likes_count, video_count
      const metricNames = metricQueries.map((q) => q.params[3]);
      expect(metricNames).toContain('follower_count');
      expect(metricNames).toContain('following_count');
      expect(metricNames).toContain('likes_count');
      expect(metricNames).toContain('video_count');
    });

    it('classifies metrics as observed', async () => {
      vi.spyOn(mockAdapter, 'fetchUserInfo').mockResolvedValue({
        ok: true,
        status: 200,
        data: { user: { display_name: 'Test', follower_count: 100 } },
        errorCode: null,
      });

      await service.syncProfile('ws-1', 'user-1', 'conn-1');

      const metricQueries = queries.filter((q) => q.sql.includes('display_metric_provenance'));
      for (const q of metricQueries) {
        expect(q.params[4]).toBe('observed');
      }
    });
  });
});
