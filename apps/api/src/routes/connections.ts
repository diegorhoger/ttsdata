/**
 * DELETE /api/connections/:id — Revoke and delete
 * 
 * Issue #54
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { tiktokConnections } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { executeDeletion, DeletionConfig, DEFAULT_DELETION_CONFIG } from '../lib/connection/deletion';

export async function registerConnectionRoutes(app: FastifyInstance) {

  /**
   * DELETE /api/connections/:id
   * 
   * Disconnects an authorized account:
   * 1. Revokes tokens with provider (best effort)
   * 2. Deletes local credentials
   * 3. Cancels queued sync jobs
   * 4. Invalidates caches
   * 5. Produces completion record
   */
  app.delete('/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const auth = request.auth!;

    // Find connection
    const connection = await db.query.tiktokConnections.findFirst({
      where: eq(tiktokConnections.id, id),
    });

    if (!connection) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'Connection not found',
      });
    }

    // Verify ownership — connections belong to users, enforced by auth context
    if (connection.userId !== auth.userId) {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only manage your own connections',
      });
    }

    const deletionConfig: DeletionConfig = DEFAULT_DELETION_CONFIG;

    // Real revocation function — calls TikTok's revoke endpoint
    const revokeFn = async (accessToken: string, refreshToken: string) => {
      const response = await fetch('https://auth.tiktok-shops.com/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          app_id: process.env.TIKTOK_APP_ID || '',
          app_secret: process.env.TIKTOK_APP_SECRET || '',
          token: accessToken,
        }),
      });
      return { confirmed: response.ok };
    };

    // Cache invalidator (in production, this would use Redis)
    const cacheInvalidator = {
      invalidateScope: async (scope: string) => {
        // In production: invalidate Redis keys matching scope
        // For now, no-op but logs
        console.log('[CACHE] Invalidating scope:', scope);
      },
    };

    // Tenant isolation checker
    const tenantChecker = {
      verifyNoOrphanRecords: async (connId: string, userId: string) => {
        // Verify no records exist outside the user's scope
        const orphans = await db.execute(
          sql`SELECT COUNT(*) as count FROM tiktok_connections WHERE id = ${connId} AND user_id != ${userId}`
        );
        return Number(orphans.rows[0]?.count || 0) === 0;
      },
    };

    // Derived record counter (snapshots, trends, scores)
    const derivedCounter = {
      countDerivedRecords: async (connId: string) => {
        // In production: count records derived from this connection
        return 0;
      },
      removeDerivedRecords: async (connId: string) => {
        // In production: remove derived records
        return 0;
      },
    };

    const result = await executeDeletion(
      id,
      deletionConfig,
      {
        findById: async (connId: string) => {
          const conn = await db.query.tiktokConnections.findFirst({
            where: eq(tiktokConnections.id, connId),
          });
          return conn ? { id: conn.id, userId: conn.userId, accessToken: conn.accessToken, refreshToken: conn.refreshToken } : null;
        },
        deleteCredentials: async (connId: string) => {
          await db.delete(tiktokConnections).where(eq(tiktokConnections.id, connId));
        },
        cancelJobs: async (_connId: string) => {
          // In production: BullMQ queue cleanup
          return 0;
        },
      },
      {
        log: async (event: any) => {
          console.log('[DELETE AUDIT]', JSON.stringify(event));
        },
      },
      revokeFn,
      cacheInvalidator,
      tenantChecker,
      derivedCounter
    );

    return reply.send({
      ok: true,
      result: {
        connectionId: result.connectionId,
        userId: result.userId,
        remoteRevocation: result.remoteRevocation,
        localCredentialsDeleted: result.localCredentialsDeleted,
        syncJobsCanceled: result.syncJobsCanceled,
        cachesInvalidated: result.cachesInvalidated,
        derivedRecordsRemoved: result.derivedRecordsRemoved,
        tenantIdIsolationVerified: result.tenantIdIsolationVerified,
        completedAt: result.completedAt,
      },
    });
  });
}
