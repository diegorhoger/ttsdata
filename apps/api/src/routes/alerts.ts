/**
 * Alert Rules & Delivery API — TTS-M2-03
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../lib/db';
import { alertRules, alertHistory } from '@ttsdata/db/src/schema';
import { requireAuth } from '../lib/auth';
import { AppError } from '../lib/errors';

const createAlertSchema = z.object({
  name: z.string().min(1).max(255),
  triggerType: z.enum([
    'score_threshold',
    'momentum',
    'commission_change',
    'price_change',
    'saturation',
    'new_content',
  ]),
  conditions: z.record(z.any()),
  cooldownMinutes: z.number().min(1).max(1440).default(60),
  deliveryChannels: z.array(z.enum(['in_app', 'email'])).default(['in_app']),
  active: z.boolean().default(true),
});

const updateAlertSchema = createAlertSchema.partial();

export async function registerAlertRoutes(app: FastifyInstance) {

  // GET /api/alerts/rules — List rules
  app.get('/rules', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    const rules = await db.query.alertRules.findMany({
      where: eq(alertRules.workspaceId, auth.workspaceId),
      orderBy: desc(alertRules.createdAt),
    });

    return reply.send({
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        triggerType: r.triggerType,
        conditions: r.conditions,
        cooldownMinutes: r.cooldownMinutes,
        deliveryChannels: r.deliveryChannels,
        active: r.active,
        lastTriggeredAt: r.lastTriggeredAt,
        createdAt: r.createdAt,
      })),
    });
  });

  // POST /api/alerts/rules — Create rule
  app.post('/rules', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const body = createAlertSchema.parse(request.body);

    const [rule] = await db.insert(alertRules).values({
      workspaceId: auth.workspaceId,
      name: body.name,
      triggerType: body.triggerType,
      conditions: body.conditions,
      cooldownMinutes: body.cooldownMinutes,
      deliveryChannels: body.deliveryChannels,
      active: body.active,
    }).returning();

    return reply.status(201).send({
      rule: {
        id: rule.id,
        name: rule.name,
        triggerType: rule.triggerType,
        conditions: rule.conditions,
        cooldownMinutes: rule.cooldownMinutes,
        deliveryChannels: rule.deliveryChannels,
        active: rule.active,
        createdAt: rule.createdAt,
      },
    });
  });

  // PATCH /api/alerts/rules/:id — Update rule
  app.patch('/rules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };
    const body = updateAlertSchema.parse(request.body);

    const rule = await db.query.alertRules.findFirst({
      where: eq(alertRules.id, id),
    });

    if (!rule || rule.workspaceId !== auth.workspaceId) {
      throw new AppError('Alert rule not found', 404, 'NOT_FOUND');
    }

    const [updated] = await db.update(alertRules)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(alertRules.id, id))
      .returning();

    return reply.send({ rule: updated });
  });

  // DELETE /api/alerts/rules/:id — Delete rule (workspace-scoped)
  app.delete('/rules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;
    const { id } = request.params as { id: string };

    const result = await db.delete(alertRules).where(
      and(
        eq(alertRules.id, id),
        eq(alertRules.workspaceId, auth.workspaceId)
      )
    ).returning();

    if (!result || result.length === 0) {
      throw new AppError('Alert rule not found', 404, 'NOT_FOUND');
    }

    return reply.send({ ok: true });
  });

  // GET /api/alerts/history — List alert history
  app.get('/history', { preHandler: requireAuth }, async (request, reply) => {
    const auth = request.auth!;

    const history = await db.query.alertHistory.findMany({
      where: eq(alertHistory.workspaceId, auth.workspaceId),
      orderBy: desc(alertHistory.createdAt),
      limit: 50,
    });

    // Fetch rules separately (no Drizzle relations defined)
    const rules = await db.query.alertRules.findMany({
      where: eq(alertRules.workspaceId, auth.workspaceId),
    });
    const ruleMap = new Map(rules.map((r) => [r.id, r]));

    return reply.send({
      history: history.map((h) => ({
        id: h.id,
        alertRuleId: h.alertRuleId,
        alertRuleName: ruleMap.get(h.alertRuleId)?.name || 'Unknown',
        triggerData: h.triggerData,
        delivered: h.delivered,
        createdAt: h.createdAt,
      })),
    });
  });
}
