/**
 * TikTok Shop OAuth connection lifecycle
 * PRD Issue #4
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../lib/db';
import { tiktokConnections } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

const TIKTOK_AUTH_URL = 'https://auth.tiktok-shops.com/oauth/authorize';
const TIKTOK_TOKEN_URL = 'https://auth.tiktok-shops.com/oauth/token';

// Scopes needed for TTSData (from capability matrix)
const REQUIRED_SCOPES = [
  'product.read',
  'product.search',
  'shop.read',
  'creator.read',
  'video.read',
  'affiliate.read',
];

export async function registerTikTokRoutes(app: FastifyInstance) {
  
  // GET /api/tiktok/auth-url - Get OAuth URL
  app.get('/auth-url', { preHandler: requireAuth }, async (request, reply) => {
    const state = randomBytes(16).toString('hex');
    const codeVerifier = randomBytes(32).toString('hex');
    
    // PKCE: store code verifier temporarily (in production, use Redis with TTL)
    // For now, we'll include it in state (simplified)
    const stateData = JSON.stringify({ state, codeVerifier, userId: request.auth!.userId });
    const stateParam = Buffer.from(stateData).toString('base64url');

    const params = new URLSearchParams({
      app_id: process.env.TIKTOK_APP_ID || '',
      redirect_uri: `${process.env.API_URL}/api/tiktok/callback`,
      state: stateParam,
      scope: REQUIRED_SCOPES.join(','),
      response_type: 'code',
    });

    return reply.send({
      authUrl: `${TIKTOK_AUTH_URL}?${params.toString()}`,
      scopes: REQUIRED_SCOPES,
    });
  });

  // GET /api/tiktok/callback - OAuth callback
  app.get('/callback', async (request, reply) => {
    const { code, state } = request.query as { code: string; state: string };

    if (!code || !state) {
      throw new AppError('Missing authorization code or state', 400, 'INVALID_CALLBACK');
    }

    // Decode state
    let stateData: { state: string; codeVerifier: string; userId: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      throw new AppError('Invalid state parameter', 400, 'INVALID_STATE');
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(TIKTOK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        app_id: process.env.TIKTOK_APP_ID || '',
        app_secret: process.env.TIKTOK_APP_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.API_URL}/api/tiktok/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new AppError('Failed to exchange authorization code', 400, 'TOKEN_EXCHANGE_FAILED');
    }

    const tokenData = await tokenResponse.json() as any;

    // Store connection (tokens should be encrypted at rest in production)
    await db.insert(tiktokConnections).values({
      userId: stateData.userId,
      marketplace: 'BR', // From capability matrix
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      scopes: tokenData.scope?.split(',') || REQUIRED_SCOPES,
      status: 'active',
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
    });

    // Redirect to frontend
    return reply.redirect(`${process.env.APP_URL}/settings/connections?connected=true`);
  });

  // GET /api/tiktok/connections - List user connections
  app.get('/connections', { preHandler: requireAuth }, async (request, reply) => {
    const connections = await db.query.tiktokConnections.findMany({
      where: eq(tiktokConnections.userId, request.auth!.userId),
    });

    return reply.send({
      connections: connections.map((c: any) => ({
        id: c.id,
        marketplace: c.marketplace,
        scopes: c.scopes,
        status: c.status,
        lastSyncAt: c.lastSyncAt,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        // Never expose tokens
      })),
    });
  });

  // DELETE /api/tiktok/connections/:id - Disconnect
  app.delete('/connections/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const conn = await db.query.tiktokConnections.findFirst({
      where: eq(tiktokConnections.id, id),
    });

    if (!conn || conn.userId !== request.auth!.userId) {
      throw new AppError('Connection not found', 404, 'NOT_FOUND');
    }

    // Revoke token with TikTok (best effort)
    try {
      await fetch('https://auth.tiktok-shops.com/oauth/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          app_id: process.env.TIKTOK_APP_ID || '',
          app_secret: process.env.TIKTOK_APP_SECRET || '',
          token: conn.accessToken,
        }),
      });
    } catch {
      // Continue even if revoke fails - we'll mark as revoked locally
    }

    await db.update(tiktokConnections)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(eq(tiktokConnections.id, id));

    return reply.send({ ok: true });
  });
}
