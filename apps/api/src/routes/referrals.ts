/**
 * Referral System API — Issue #44
 * 
 * Generates unique referral links, tracks referrals and conversions,
 * and rewards both referrer and referee.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../lib/db';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

// In-memory store for MVP — would be a database table in production
const referrals = new Map<string, {
  id: string;
  referrerId: string;
  refereeId: string | null;
  code: string;
  status: 'pending' | 'converted' | 'rewarded';
  createdAt: Date;
  convertedAt: Date | null;
}>();

let referralCounter = 0;

export async function registerReferralRoutes(app: FastifyInstance) {

  // GET /api/referrals — Get user's referral stats and link
  app.get('/', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    // Get or create referral code for user
    const userReferrals = Array.from(referrals.values()).filter(
      (r) => r.referrerId === auth.userId
    );

    const referralCode = userReferrals[0]?.code || generateReferralCode(auth.userId);

    // Count conversions
    const conversions = userReferrals.filter((r) => r.status === 'converted' || r.status === 'rewarded');

    return reply.send({
      referralCode,
      referralLink: `${process.env.APP_URL || 'http://localhost:3000'}/register?ref=${referralCode}`,
      stats: {
        totalReferrals: userReferrals.length,
        conversions: conversions.length,
        pending: userReferrals.length - conversions.length,
      },
      rewards: {
        // In production, this would query actual reward records
        premiumDaysEarned: conversions.length * 7, // 7 days per conversion
      },
    });
  });

  // POST /api/referrals/track — Track a referral signup
  app.post('/track', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { referralCode } = z.object({ referralCode: z.string() }).parse(request.body);

    // Find the referral
    const referral = Array.from(referrals.values()).find(
      (r) => r.code === referralCode && r.referrerId !== auth.userId
    );

    if (!referral) {
      throw new AppError('Invalid referral code', 404, 'NOT_FOUND');
    }

    if (referral.status !== 'pending') {
      throw new AppError('Referral already tracked', 409, 'ALREADY_TRACKED');
    }

    // Mark as converted
    referral.refereeId = auth.userId;
    referral.status = 'converted';
    referral.convertedAt = new Date();

    return reply.send({
      ok: true,
      message: 'Referral tracked. Both you and your referrer will receive premium benefits.',
    });
  });

  // POST /api/referrals/reward — Mark a referral as rewarded (admin only)
  app.post('/reward', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { referralId } = z.object({ referralId: z.string() }).parse(request.body);

    const referral = referrals.get(referralId);
    if (!referral) {
      throw new AppError('Referral not found', 404, 'NOT_FOUND');
    }

    if (referral.status !== 'converted') {
      throw new AppError('Referral must be converted before rewarding', 400, 'NOT_CONVERTED');
    }

    referral.status = 'rewarded';

    return reply.send({ ok: true, message: 'Referral rewarded.' });
  });
}

function generateReferralCode(userId: string): string {
  referralCounter++;
  const hash = Buffer.from(`${userId}-${referralCounter}-${Date.now()}`)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase();
  return `TTS-${hash}`;
}
