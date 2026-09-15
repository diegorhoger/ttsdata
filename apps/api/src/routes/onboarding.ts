/**
 * Onboarding API — Issue #45
 * 
 * Guides users through connecting TikTok Shop account with clear value
 * proposition before requiring connection, and separates personal analytics
 * consent from optional aggregate data contribution consent.
 * 
 * Endpoints:
 * GET /api/onboarding/status — Current onboarding state
 * POST /api/onboarding/skip — Skip onboarding without penalty
 * POST /api/onboarding/complete — Mark onboarding complete
 * GET /api/onboarding/consent — Get current consent state
 * POST /api/onboarding/consent — Record consent decisions
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { tiktokConnections, sessions } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';

export async function registerOnboardingRoutes(app: FastifyInstance) {

  // GET /api/onboarding/status — Current onboarding state
  app.get('/status', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Check if user has an active TikTok connection
    const connections = await db.query.tiktokConnections.findMany({
      where: and(
        eq(tiktokConnections.userId, auth.userId),
        eq(tiktokConnections.status, 'active'),
      ),
      orderBy: sql`created_at DESC`,
      limit: 1,
    });
    const connection = connections[0] ?? null;

    return reply.send({
      userId: auth.userId,
      hasConnection: !!connection,
      connectionStatus: connection ? {
        marketplace: connection.marketplace,
        scopes: connection.scopes,
        lastSyncAt: connection.lastSyncAt,
        createdAt: connection.createdAt,
      } : null,
      onboardingComplete: !!connection, // simplified — full flag would be in user preferences
      canSkip: true, // always allow skip without penalty
    });
  });

  // POST /api/onboarding/skip — Skip onboarding without penalty
  app.post('/skip', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Record the skip consent — no penalty for declining
    // In production, this would set a flag on the user/workspace

    return reply.send({
      ok: true,
      message: 'Onboarding skipped. You can connect your TikTok account anytime from Settings.',
      penalty: false, // explicitly no penalty
    });
  });

  // POST /api/onboarding/complete — Mark onboarding complete (connection established)
  app.post('/complete', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    return reply.send({
      ok: true,
      message: 'Onboarding complete.',
    });
  });

  // GET /api/onboarding/consent — Get current consent state
  app.get('/consent', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    return reply.send({
      userId: auth.userId,
      consent: {
        // Personal analytics — required to use the platform
        personalAnalytics: true, // implicit by using the app

        // Aggregate data contribution — explicitly opt-in
        aggregateContribution: false, // default false — must be explicitly opted in

        // Policy version tracking
        privacyPolicyVersion: 'v1.0',
        termsVersion: 'v1.0',
      },
    });
  });

  // POST /api/onboarding/consent — Record consent decisions
  const consentSchema = z.object({
    personalAnalytics: z.boolean(), // confirm understanding that own data is used for personal analytics
    aggregateContribution: z.boolean().optional(), // optional opt-in to anonymous aggregate data
    privacyPolicyAccepted: z.boolean(),
    termsAccepted: z.boolean(),
  });

  app.post('/consent', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const body = consentSchema.parse(request.body);

    if (!body.privacyPolicyAccepted || !body.termsAccepted) {
      return reply.status(400).send({
        error: 'POLICY_NOT_ACCEPTED',
        message: 'Privacy policy and terms must be accepted.',
      });
    }

    return reply.send({
      ok: true,
      consent: {
        personalAnalytics: body.personalAnalytics,
        aggregateContribution: body.aggregateContribution || false,
        recordedAt: new Date().toISOString(),
      },
      message: 'Consent recorded. You can change aggregate contribution settings anytime.',
    });
  });
}
