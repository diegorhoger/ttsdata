import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CCOSRepository,
  CCOSProductionQueueRepository,
  ProductionQueueConflict,
  ProductionQueueValidationError,
  QUEUE_SIGNALS,
  type CCOSContentRecord,
  type CCOSInteractionRecord,
  type CCOInteractionSourceRecord,
  type CCOSNextActionRecord,
  type CCOSPartnershipRecord,
  type CCOSProductRecord,
  type CCOSStoreRecord,
  type CCOSTemplateVersionRecord,
  type CreateCCOSPartnershipInput,
  type CreateCCOSContentInput,
  type CreateCCOSInteractionInput,
  type CreateCCOSNextActionInput,
  type CreateCCOSProductInput,
  type CreateCCOSStoreInput,
  type CreateCCOSTemplateVersionInput,
  type UpdateCCOSPartnershipInput,
  type UpdateCCOSContentInput,
  type UpdateCCOSNextActionInput,
  type UpdateCCOSProductInput,
  type UpdateCCOSStoreInput,
  type CreateCCOSPerformanceSnapshotInput,
  type PerformanceSnapshot,
} from '@ttsdata/db';
import { pool } from '../lib/db';
import { requireAuth, requireRoles } from '../lib/auth';
import { AppError } from '../lib/errors';

const partnershipType = z.enum([
  'inbound_invite', 'outbound_prospecting', 'affiliate', 'paid_campaign', 'gifting',
]);
const partnershipStatus = z.enum([
  'lead', 'contacted', 'negotiating', 'active', 'waiting', 'paused', 'completed', 'declined', 'cancelled',
]);
const priority = z.enum(['low', 'normal', 'high', 'urgent']);
const productStatus = z.enum([
  'proposed', 'selected', 'sample_requested', 'sample_approved', 'shipped', 'received',
  'content_queue', 'in_production', 'content_live', 'monitoring', 'declined', 'cancelled',
  'out_of_stock', 'replacement_needed', 'paused', 'completed',
]);
const contentStatus = z.enum([
  'idea', 'planned', 'filming', 'editing', 'ready', 'scheduled', 'published',
  'ads_authorized', 'monitoring',
]);
const adAuthorizationStatus = z.enum(['pending', 'authorized', 'unavailable']);
const decimalValue = (maxIntegerDigits: number) => z.string().regex(
  new RegExp(`^\\d{1,${maxIntegerDigits}}(?:\\.\\d{1,6})?$`),
  `Must be a non-negative decimal with at most ${maxIntegerDigits} integer and 6 fractional digits`,
);
const amountValue = decimalValue(14); // numeric(20,6)
const rateValue = decimalValue(3); // numeric(9,6)
const dateValue: z.ZodType<Date, z.ZodTypeDef, unknown> = z.preprocess(
  (value) => typeof value === 'string' ? new Date(value) : value,
  z.date(),
);
const metricClassification = z.enum(['observed', 'calculated', 'inferred', 'self-reported', 'unavailable']);
const countMetric = z.object({ value: z.number().int().safe().nonnegative().nullable(), classification: metricClassification, provenance: z.unknown().optional() }).strict();
const amountMetric = z.object({ value: z.string().regex(/^\d{1,14}(?:\.\d{1,6})?$/).nullable(), classification: metricClassification, provenance: z.unknown().optional() }).strict();
const conversionMetric = z.object({ value: z.string().regex(/^(?:0(?:\.\d{1,8})?|1(?:\.0{1,8})?|\.\d{1,8})$/).nullable(), classification: metricClassification, provenance: z.unknown().optional() }).strict();
const performanceMetricShape = {
  views: countMetric.optional(), clicks: countMetric.optional(), orders: countMetric.optional(),
  gmv: amountMetric.optional(), commission: amountMetric.optional(), conversion: conversionMetric.optional(),
};
const createPerformanceSnapshotSchema = z.object({
  observedAt: dateValue,
  source: z.string().trim().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  metrics: z.object(performanceMetricShape).strict(),
}).strict().superRefine((snapshot, context) => {
  for (const [metric, reading] of Object.entries(snapshot.metrics)) {
    if (!reading) continue;
    const unavailable = reading.value === null;
    if (unavailable !== (reading.classification === 'unavailable')) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['metrics', metric], message: 'Null values must be classified unavailable; available values cannot be unavailable' });
    }
  }
  if ((snapshot.metrics.gmv?.value !== undefined && snapshot.metrics.gmv.value !== null)
      || (snapshot.metrics.commission?.value !== undefined && snapshot.metrics.commission.value !== null)) {
    if (!snapshot.currency) context.addIssue({ code: z.ZodIssueCode.custom, path: ['currency'], message: 'Currency is required for GMV or commission values' });
  }
});
const storeParamsSchema = z.object({ storeId: z.string().uuid() }).strict();
const partnershipParamsSchema = z.object({ partnershipId: z.string().uuid() }).strict();
const productParamsSchema = z.object({ productId: z.string().uuid() }).strict();
const contentParamsSchema = z.object({ contentId: z.string().uuid() }).strict();
const nextActionParamsSchema = z.object({ actionId: z.string().uuid() }).strict();

const createStoreSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contactName: z.string().trim().min(1).max(255).optional(),
  contactEmail: z.string().email().max(255).optional(),
  notes: z.string().max(10_000).optional(),
}).strict();

const updateStoreSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  contactName: z.string().trim().min(1).max(255).nullable().optional(),
  contactEmail: z.string().email().max(255).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const createPartnershipSchema = z.object({
  type: partnershipType,
  title: z.string().trim().min(1).max(255).optional(),
  terms: z.string().max(20_000).optional(),
  priority: priority.optional(),
  lastContactAt: dateValue.optional(),
}).strict();

const updatePartnershipSchema = z.object({
  type: partnershipType.optional(),
  status: partnershipStatus.optional(),
  title: z.string().trim().min(1).max(255).nullable().optional(),
  terms: z.string().max(20_000).nullable().optional(),
  priority: priority.optional(),
  lastContactAt: dateValue.nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const createProductSchema = z.object({
  name: z.string().trim().min(1).max(512),
  sku: z.string().trim().min(1).max(128).optional(),
  productUrl: z.string().url().max(2048).optional(),
  priceAmount: amountValue.optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  commissionRate: rateValue.optional(),
  commissionAmount: amountValue.optional(),
  stockState: z.string().trim().min(1).max(64).optional(),
  trackingCode: z.string().trim().min(1).max(255).optional(),
  shippedAt: dateValue.optional(),
  receivedAt: dateValue.optional(),
  priority: priority.optional(),
  source: z.string().trim().min(1).max(64).optional(),
  provenance: z.unknown().optional(),
}).strict();

const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(512).optional(),
  sku: z.string().trim().min(1).max(128).nullable().optional(),
  productUrl: z.string().url().max(2048).nullable().optional(),
  priceAmount: amountValue.nullable().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).nullable().optional(),
  commissionRate: rateValue.nullable().optional(),
  commissionAmount: amountValue.nullable().optional(),
  stockState: z.string().trim().min(1).max(64).nullable().optional(),
  status: productStatus.optional(),
  trackingCode: z.string().trim().min(1).max(255).nullable().optional(),
  shippedAt: dateValue.nullable().optional(),
  receivedAt: dateValue.nullable().optional(),
  priority: priority.optional(),
  provenance: z.unknown().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const createContentSchema = z.object({
  platform: z.string().trim().min(1).max(64),
  format: z.string().trim().min(1).max(64).optional(),
  concept: z.string().max(20_000).optional(),
}).strict();

const updateContentSchema = z.object({
  status: contentStatus.optional(),
  platform: z.string().trim().min(1).max(64).optional(),
  format: z.string().trim().min(1).max(64).nullable().optional(),
  concept: z.string().max(20_000).nullable().optional(),
  scheduledAt: dateValue.nullable().optional(),
  publishedAt: dateValue.nullable().optional(),
  publicationUrl: z.string().url().max(2048).nullable().optional(),
  adAuthorizationStatus: adAuthorizationStatus.nullable().optional(),
  adAuthorizationCode: z.string().trim().min(1).max(255).nullable().optional(),
  adAuthorizationCreatedAt: dateValue.nullable().optional(),
  adAuthorizationExpiresAt: dateValue.nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required').superRefine((body, context) => {
  if (body.adAuthorizationStatus && body.adAuthorizationStatus !== 'authorized'
    && (body.adAuthorizationCode || body.adAuthorizationCreatedAt || body.adAuthorizationExpiresAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['adAuthorizationStatus'],
      message: 'Pending or unavailable authorization cannot include code or timestamps',
    });
  }
  if (body.status === 'ads_authorized' && body.adAuthorizationStatus
    && body.adAuthorizationStatus !== 'authorized') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'ads_authorized requires authorized ad-authorization details',
    });
  }
});

const actionTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('store'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('partnership'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('product'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('content'), id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('interaction'), id: z.string().uuid() }).strict(),
]);
const nextActionStatus = z.enum(['open', 'in_progress', 'waiting', 'completed', 'cancelled']);
const createNextActionSchema = z.object({
  target: actionTargetSchema,
  title: z.string().trim().min(1).max(255),
  priority: priority.optional(),
  dueAt: dateValue.optional(),
  ownerUserId: z.string().uuid().optional(),
}).strict();
const updateNextActionSchema = z.object({
  status: nextActionStatus.optional(),
  title: z.string().trim().min(1).max(255).optional(),
  priority: priority.optional(),
  dueAt: dateValue.nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  waitingReason: z.string().trim().min(1).max(2_000).nullable().optional(),
  resolutionReason: z.string().trim().min(1).max(2_000).nullable().optional(),
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

const templateTypeEnum = z.enum([
  'invite_first_contact', 'partnership_confirm', 'sample_confirm', 'receipt',
  'publication', 'ad_auth', 'followup_performance',
]);
const lifecycleTemplateEventEnum = z.enum([
  'invite_received',
  'partnership_confirmed',
  'sample_requested',
  'sample_approved',
  'product_received',
  'content_published',
  'ad_authorization_needed',
  'performance_review_due',
  'replenishment_due',
]);
const lifecycleTemplateTypeByEvent = {
  invite_received: 'invite_first_contact',
  partnership_confirmed: 'partnership_confirm',
  sample_requested: 'sample_confirm',
  sample_approved: 'sample_confirm',
  product_received: 'receipt',
  content_published: 'publication',
  ad_authorization_needed: 'ad_auth',
  performance_review_due: 'followup_performance',
  replenishment_due: 'followup_performance',
} as const;
const createTemplateSchema = z.object({
  type: templateTypeEnum,
  subject: z.string().trim().min(1).max(512),
  body: z.string().min(1).max(50_000),
  variables: z.array(z.string().trim().regex(/^\w+$/).max(128)).optional(),
}).strict().superRefine((template, context) => {
  const withoutValidPlaceholders = `${template.subject}\n${template.body}`.replace(/\{\{\w+\}\}/g, '');
  if (withoutValidPlaceholders.includes('{{') || withoutValidPlaceholders.includes('}}')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['body'],
      message: 'Template contains a malformed placeholder',
    });
    return;
  }
  const actual = new Set<string>();
  for (const text of [template.subject, template.body]) {
    for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) actual.add(match[1]);
  }
  const declared = template.variables ?? [];
  const declaredSet = new Set(declared);
  if (declaredSet.size !== declared.length ||
      [...actual].some((variable) => !declaredSet.has(variable)) ||
      declared.some((variable) => !actual.has(variable))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variables'],
      message: 'Declared variables must exactly match subject and body placeholders',
    });
  }
});
const createInteractionSchema = z.object({
  partnershipId: z.string().uuid(),
  // This route records inbound history only. Outbound events require the
  // explicit mark-sent action below; callers cannot create system events.
  direction: z.literal('inbound'),
  channel: z.string().trim().min(1).max(64),
  summary: z.string().min(1).max(2_000),
  occurredAt: z.preprocess(
    (value) => typeof value === 'string' ? new Date(value) : value,
    z.date().optional(),
  ),
  templateVersionId: z.string().uuid().optional(),
  sourceLinks: z.array(
    z.object({
      sourceType: z.enum(['product', 'content', 'partnership', 'action', 'template_version']),
      sourceId: z.string().uuid(),
    }).strict(),
  ).optional(),
}).strict();
const markSentSchema = z.object({
  channel: z.string().trim().min(1).max(64),
  summary: z.string().min(1).max(2_000),
  occurredAt: z.preprocess(
    (value) => typeof value === 'string' ? new Date(value) : value,
    z.date().optional(),
  ),
  templateVersionId: z.string().uuid().optional(),
  sourceLinks: createInteractionSchema.shape.sourceLinks,
}).strict();

type StorePartnershipRepository = {
  createStore(input: CreateCCOSStoreInput): Promise<CCOSStoreRecord>;
  listStores(workspaceId: string): Promise<CCOSStoreRecord[]>;
  getStore(workspaceId: string, storeId: string): Promise<CCOSStoreRecord | null>;
  updateStore(workspaceId: string, storeId: string, input: UpdateCCOSStoreInput): Promise<CCOSStoreRecord | null>;
  createPartnership(input: CreateCCOSPartnershipInput): Promise<CCOSPartnershipRecord>;
  listPartnerships(workspaceId: string, storeId?: string): Promise<CCOSPartnershipRecord[]>;
  getPartnership(workspaceId: string, partnershipId: string): Promise<CCOSPartnershipRecord | null>;
  updatePartnership(
    workspaceId: string,
    partnershipId: string,
    input: UpdateCCOSPartnershipInput,
  ): Promise<CCOSPartnershipRecord | null>;
  createProduct(input: CreateCCOSProductInput): Promise<CCOSProductRecord>;
  listProducts(workspaceId: string, partnershipId?: string): Promise<CCOSProductRecord[]>;
  getProduct(workspaceId: string, productId: string): Promise<CCOSProductRecord | null>;
  updateProduct(
    workspaceId: string,
    productId: string,
    input: UpdateCCOSProductInput,
  ): Promise<CCOSProductRecord | null>;
  createContent(input: CreateCCOSContentInput): Promise<CCOSContentRecord>;
  listContents(workspaceId: string, productId?: string): Promise<CCOSContentRecord[]>;
  getContent(workspaceId: string, contentId: string): Promise<CCOSContentRecord | null>;
  updateContent(
    workspaceId: string,
    contentId: string,
    input: UpdateCCOSContentInput,
  ): Promise<CCOSContentRecord | null>;
  createNextAction(input: CreateCCOSNextActionInput): Promise<CCOSNextActionRecord>;
  listAttentionInbox(workspaceId: string): Promise<CCOSNextActionRecord[]>;
  getNextAction(workspaceId: string, actionId: string): Promise<CCOSNextActionRecord | null>;
  updateNextAction(
    workspaceId: string,
    actionId: string,
    input: UpdateCCOSNextActionInput,
  ): Promise<CCOSNextActionRecord | null>;
  createInteraction(input: CreateCCOSInteractionInput): Promise<CCOSInteractionRecord>;
  listInteractions(workspaceId: string, partnershipId: string): Promise<CCOSInteractionRecord[]>;
  listTimeline(workspaceId: string, partnershipId: string): Promise<Array<CCOSInteractionRecord & { sources: CCOInteractionSourceRecord[] }>>;
  getInteractionSources(workspaceId: string, interactionId: string): Promise<CCOInteractionSourceRecord[]>;
  createTemplateVersion(input: CreateCCOSTemplateVersionInput): Promise<CCOSTemplateVersionRecord>;
  getTemplateVersion(workspaceId: string, templateVersionId: string): Promise<CCOSTemplateVersionRecord | null>;
  listTemplateVersions(workspaceId: string, type?: string): Promise<CCOSTemplateVersionRecord[]>;
  getLatestTemplateVersion(workspaceId: string, type: string): Promise<CCOSTemplateVersionRecord | null>;
  renderTemplate(template: CCOSTemplateVersionRecord, context: Record<string, string>): { subject: string; body: string };
  createPerformanceSnapshot(input: CreateCCOSPerformanceSnapshotInput): Promise<PerformanceSnapshot>;
  listPerformanceSnapshots(workspaceId: string, filter?: { contentId?: string; productId?: string; from?: Date; to?: Date }): Promise<PerformanceSnapshot[]>;
  getPerformanceComparisons(workspaceId: string, contentId: string, snapshotId?: string): Promise<{ snapshot: PerformanceSnapshot; comparisons: unknown } | null>;
};

async function validateInteractionReferences(
  repository: StorePartnershipRepository,
  workspaceId: string,
  partnershipId: string,
  templateVersionId?: string,
  sourceLinks?: Array<{ sourceType: 'product' | 'content' | 'partnership' | 'action' | 'template_version'; sourceId: string }>,
) {
  if (!await repository.getPartnership(workspaceId, partnershipId)) {
    throw new AppError('Partnership not found', 404, 'NOT_FOUND');
  }
  if (templateVersionId && !await repository.getTemplateVersion(workspaceId, templateVersionId)) {
    throw new AppError('Template version not found', 404, 'NOT_FOUND');
  }
  for (const link of sourceLinks ?? []) {
    let exists: boolean;
    switch (link.sourceType) {
      case 'product':
        exists = Boolean(await repository.getProduct(workspaceId, link.sourceId));
        break;
      case 'content':
        exists = Boolean(await repository.getContent(workspaceId, link.sourceId));
        break;
      case 'partnership':
        exists = Boolean(await repository.getPartnership(workspaceId, link.sourceId));
        break;
      case 'action':
        exists = Boolean(await repository.getNextAction(workspaceId, link.sourceId));
        break;
      case 'template_version':
        exists = Boolean(await repository.getTemplateVersion(workspaceId, link.sourceId));
        break;
    }
    if (!exists) throw new AppError(`Interaction source ${link.sourceType} not found`, 404, 'NOT_FOUND');
  }
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('Request validation failed', 400, 'VALIDATION_ERROR', {
      fields: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}

export type CCOSRouteOptions = {
  repository?: StorePartnershipRepository;
  productionQueueRepository?: Pick<CCOSProductionQueueRepository, 'getProductionQueue' | 'reorderProductionQueue' | 'listProductionQueueAudit'>;
  authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export async function registerCCOSRoutes(app: FastifyInstance, options: CCOSRouteOptions = {}) {
  const repository = options.repository ?? new CCOSRepository(pool);
  const productionQueueRepository = options.productionQueueRepository ?? new CCOSProductionQueueRepository(pool);
  const authenticate = options.authenticate ?? requireAuth;
  const authorizeWorkspaceWrite = requireRoles('owner', 'admin');

  app.get('/production-queue', { preHandler: authenticate }, async (request, reply) => {
    const query = parse(z.object({
      sort: z.enum(['manual', 'score', ...QUEUE_SIGNALS]).optional(),
      signal: z.enum(QUEUE_SIGNALS).optional(),
      missing: z.enum(['include', 'only', 'exclude']).optional(),
      stockState: z.string().min(1).max(64).optional(),
      priority: priority.optional(),
    }).strict(), request.query);
    try { return reply.send(await productionQueueRepository.getProductionQueue(request.auth!.workspaceId, query)); }
    catch (error) {
      if (error instanceof ProductionQueueValidationError) throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      throw error;
    }
  });

  app.put('/production-queue/order', { preHandler: [authenticate, authorizeWorkspaceWrite] }, async (request, reply) => {
    const body = parse(z.object({
      expectedRevision: z.number().int().safe().nonnegative(),
      membershipToken: z.string().regex(/^[a-f0-9]{64}$/),
      productIds: z.array(z.string().uuid()).max(1000).refine((ids) => new Set(ids).size === ids.length, 'Duplicate product IDs'),
      reason: z.string().trim().min(1).max(2000),
    }).strict(), request.body);
    try { return reply.send(await productionQueueRepository.reorderProductionQueue(request.auth!.workspaceId, request.auth!.userId, body)); }
    catch (error) {
      if (error instanceof ProductionQueueConflict) throw new AppError(error.message, 409, 'QUEUE_CONFLICT');
      if (error instanceof ProductionQueueValidationError) throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      throw error;
    }
  });

  app.get('/production-queue/audit', { preHandler: authenticate }, async (request, reply) => {
    return reply.send({ audit: await productionQueueRepository.listProductionQueueAudit(request.auth!.workspaceId) });
  });

  app.get('/stores', { preHandler: authenticate }, async (request, reply) => {
    return reply.send({ stores: await repository.listStores(request.auth!.workspaceId) });
  });

  app.post('/stores', { preHandler: [authenticate, authorizeWorkspaceWrite] }, async (request, reply) => {
    const body = parse(createStoreSchema, request.body);
    const store = await repository.createStore({ workspaceId: request.auth!.workspaceId, ...body });
    return reply.status(201).send({ store });
  });

  app.get('/stores/:storeId', { preHandler: authenticate }, async (request, reply) => {
    const { storeId } = parse(storeParamsSchema, request.params);
    const store = await repository.getStore(request.auth!.workspaceId, storeId);
    if (!store) throw new AppError('Store not found', 404, 'NOT_FOUND');
    return reply.send({ store });
  });

  app.patch('/stores/:storeId', { preHandler: [authenticate, authorizeWorkspaceWrite] }, async (request, reply) => {
    const { storeId } = parse(storeParamsSchema, request.params);
    const store = await repository.updateStore(
      request.auth!.workspaceId,
      storeId,
      parse(updateStoreSchema, request.body),
    );
    if (!store) throw new AppError('Store not found', 404, 'NOT_FOUND');
    return reply.send({ store });
  });

  app.get('/partnerships', { preHandler: authenticate }, async (request, reply) => {
    const query = parse(z.object({ storeId: z.string().uuid().optional() }).strict(), request.query);
    return reply.send({
      partnerships: await repository.listPartnerships(request.auth!.workspaceId, query.storeId),
    });
  });

  app.post('/stores/:storeId/partnerships', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { storeId } = parse(storeParamsSchema, request.params);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getStore(workspaceId, storeId)) {
      throw new AppError('Store not found', 404, 'NOT_FOUND');
    }
    const partnership = await repository.createPartnership({
      workspaceId,
      storeId,
      ...parse(createPartnershipSchema, request.body),
    });
    return reply.status(201).send({ partnership });
  });

  app.get('/partnerships/:partnershipId', { preHandler: authenticate }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    const partnership = await repository.getPartnership(request.auth!.workspaceId, partnershipId);
    if (!partnership) throw new AppError('Partnership not found', 404, 'NOT_FOUND');
    return reply.send({ partnership });
  });

  app.patch('/partnerships/:partnershipId', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    try {
      const partnership = await repository.updatePartnership(
        request.auth!.workspaceId,
        partnershipId,
        parse(updatePartnershipSchema, request.body),
      );
      if (!partnership) throw new AppError('Partnership not found', 404, 'NOT_FOUND');
      return reply.send({ partnership });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid CCOS partnership transition:')) {
        throw new AppError(error.message, 409, 'INVALID_TRANSITION');
      }
      throw error;
    }
  });

  app.get('/products', { preHandler: authenticate }, async (request, reply) => {
    const query = parse(z.object({ partnershipId: z.string().uuid().optional() }).strict(), request.query);
    return reply.send({
      products: await repository.listProducts(request.auth!.workspaceId, query.partnershipId),
    });
  });

  app.post('/partnerships/:partnershipId/products', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getPartnership(workspaceId, partnershipId)) {
      throw new AppError('Partnership not found', 404, 'NOT_FOUND');
    }
    const product = await repository.createProduct({
      workspaceId,
      partnershipId,
      ...parse(createProductSchema, request.body),
    });
    return reply.status(201).send({ product });
  });

  app.get('/products/:productId', { preHandler: authenticate }, async (request, reply) => {
    const { productId } = parse(productParamsSchema, request.params);
    const product = await repository.getProduct(request.auth!.workspaceId, productId);
    if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
    return reply.send({ product });
  });

  app.patch('/products/:productId', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { productId } = parse(productParamsSchema, request.params);
    try {
      const product = await repository.updateProduct(
        request.auth!.workspaceId,
        productId,
        parse(updateProductSchema, request.body),
      );
      if (!product) throw new AppError('Product not found', 404, 'NOT_FOUND');
      return reply.send({ product });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid CCOS product transition:')) {
        throw new AppError(error.message, 409, 'INVALID_TRANSITION');
      }
      throw error;
    }
  });

  app.get('/contents', { preHandler: authenticate }, async (request, reply) => {
    const query = parse(z.object({ productId: z.string().uuid().optional() }).strict(), request.query);
    return reply.send({
      contents: await repository.listContents(request.auth!.workspaceId, query.productId),
    });
  });

  app.post('/products/:productId/contents', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { productId } = parse(productParamsSchema, request.params);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getProduct(workspaceId, productId)) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    const content = await repository.createContent({
      workspaceId,
      productId,
      ...parse(createContentSchema, request.body),
    });
    return reply.status(201).send({ content });
  });

  app.get('/contents/:contentId', { preHandler: authenticate }, async (request, reply) => {
    const { contentId } = parse(contentParamsSchema, request.params);
    const content = await repository.getContent(request.auth!.workspaceId, contentId);
    if (!content) throw new AppError('Content not found', 404, 'NOT_FOUND');
    return reply.send({ content });
  });

  app.post('/contents/:contentId/performance', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { contentId } = parse(contentParamsSchema, request.params);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getContent(workspaceId, contentId)) throw new AppError('Content not found', 404, 'NOT_FOUND');
    const snapshot = await repository.createPerformanceSnapshot({
      workspaceId, contentId, ...parse(createPerformanceSnapshotSchema, request.body),
    });
    return reply.status(201).send({ snapshot });
  });

  app.get('/contents/:contentId/performance', { preHandler: authenticate }, async (request, reply) => {
    const { contentId } = parse(contentParamsSchema, request.params);
    const query = parse(z.object({ from: dateValue.optional(), to: dateValue.optional() }).strict()
      .refine((value) => !value.from || !value.to || value.from <= value.to, 'from must be at or before to'), request.query);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getContent(workspaceId, contentId)) throw new AppError('Content not found', 404, 'NOT_FOUND');
    const snapshots = await repository.listPerformanceSnapshots(workspaceId, { contentId, ...query });
    const latest = snapshots[snapshots.length - 1];
    const comparison = latest ? await repository.getPerformanceComparisons(workspaceId, contentId, latest.id) : null;
    return reply.send({ snapshots, comparisons: comparison?.comparisons ?? null });
  });

  app.get('/products/:productId/performance', { preHandler: authenticate }, async (request, reply) => {
    const { productId } = parse(productParamsSchema, request.params);
    const query = parse(z.object({ from: dateValue.optional(), to: dateValue.optional() }).strict()
      .refine((value) => !value.from || !value.to || value.from <= value.to, 'from must be at or before to'), request.query);
    const workspaceId = request.auth!.workspaceId;
    if (!await repository.getProduct(workspaceId, productId)) throw new AppError('Product not found', 404, 'NOT_FOUND');
    const snapshots = await repository.listPerformanceSnapshots(workspaceId, { productId, ...query });
    const contentIds = [...new Set(snapshots.map(({ contentId }) => contentId))];
    const comparisonsByContent: Record<string, unknown> = {};
    for (const contentId of contentIds) {
      const latest = snapshots.filter((item) => item.contentId === contentId).at(-1);
      const comparison = latest
        ? await repository.getPerformanceComparisons(workspaceId, contentId, latest.id) : null;
      if (comparison) comparisonsByContent[contentId] = comparison.comparisons;
    }
    return reply.send({ snapshots, comparisonsByContent });
  });

  app.patch('/contents/:contentId', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { contentId } = parse(contentParamsSchema, request.params);
    try {
      const content = await repository.updateContent(
        request.auth!.workspaceId,
        contentId,
        parse(updateContentSchema, request.body),
      );
      if (!content) throw new AppError('Content not found', 404, 'NOT_FOUND');
      return reply.send({ content });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid CCOS content')) {
        throw new AppError(error.message, 409, 'INVALID_TRANSITION');
      }
      throw error;
    }
  });

  app.get('/next-actions', { preHandler: authenticate }, async (request, reply) => {
    return reply.send({ nextActions: await repository.listAttentionInbox(request.auth!.workspaceId) });
  });

  app.post('/next-actions', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const body = parse(createNextActionSchema, request.body);
    const input: CreateCCOSNextActionInput = {
      workspaceId: request.auth!.workspaceId,
      ...body,
      generatedAutomatically: false,
    };
    const nextAction = await repository.createNextAction(input);
    return reply.status(201).send({ nextAction });
  });

  app.get('/next-actions/:actionId', { preHandler: authenticate }, async (request, reply) => {
    const { actionId } = parse(nextActionParamsSchema, request.params);
    const nextAction = await repository.getNextAction(request.auth!.workspaceId, actionId);
    if (!nextAction) throw new AppError('Next action not found', 404, 'NOT_FOUND');
    return reply.send({ nextAction });
  });

  app.patch('/next-actions/:actionId', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { actionId } = parse(nextActionParamsSchema, request.params);
    try {
      const nextAction = await repository.updateNextAction(
        request.auth!.workspaceId,
        actionId,
        parse(updateNextActionSchema, request.body),
      );
      if (!nextAction) throw new AppError('Next action not found', 404, 'NOT_FOUND');
      return reply.send({ nextAction });
    } catch (error) {
      if (error instanceof Error && (error.message.startsWith('Invalid CCOS next action transition:')
        || error.message === 'Generated CCOS next actions are resolved only by a target lifecycle transition')) {
        throw new AppError(error.message, 409, 'INVALID_TRANSITION');
      }
      throw error;
    }
  });

  // Interaction timeline and template routes
  app.get('/partnerships/:partnershipId/interactions', { preHandler: authenticate }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    if (!await repository.getPartnership(request.auth!.workspaceId, partnershipId)) {
      throw new AppError('Partnership not found', 404, 'NOT_FOUND');
    }
    const interactions = await repository.listInteractions(request.auth!.workspaceId, partnershipId);
    return reply.send({ interactions });
  });

  app.get('/partnerships/:partnershipId/timeline', { preHandler: authenticate }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    if (!await repository.getPartnership(request.auth!.workspaceId, partnershipId)) {
      throw new AppError('Partnership not found', 404, 'NOT_FOUND');
    }
    const timeline = await repository.listTimeline(request.auth!.workspaceId, partnershipId);
    return reply.send({ timeline });
  });

  app.post('/interactions', { preHandler: [authenticate, authorizeWorkspaceWrite] }, async (request, reply) => {
    const body = parse(createInteractionSchema, request.body);
    const workspaceId = request.auth!.workspaceId;
    await validateInteractionReferences(
      repository, workspaceId, body.partnershipId, body.templateVersionId, body.sourceLinks,
    );
    const interaction = await repository.createInteraction({
      workspaceId,
      partnershipId: body.partnershipId,
      direction: body.direction,
      channel: body.channel,
      summary: body.summary,
      occurredAt: body.occurredAt,
      templateVersionId: body.templateVersionId,
      sourceLinks: body.sourceLinks,
    });
    return reply.status(201).send({ interaction });
  });

  app.post('/partnerships/:partnershipId/mark-sent', {
    preHandler: [authenticate, authorizeWorkspaceWrite],
  }, async (request, reply) => {
    const { partnershipId } = parse(partnershipParamsSchema, request.params);
    const workspaceId = request.auth!.workspaceId;
    const body = parse(markSentSchema, request.body);
    await validateInteractionReferences(
      repository, workspaceId, partnershipId, body.templateVersionId, body.sourceLinks,
    );
    const interaction = await repository.createInteraction({
      workspaceId,
      partnershipId,
      direction: 'outbound',
      channel: body.channel,
      summary: body.summary,
      occurredAt: body.occurredAt,
      templateVersionId: body.templateVersionId,
      sourceLinks: body.sourceLinks,
    });
    return reply.status(201).send({ interaction });
  });

  app.get('/interactions/:interactionId/sources', { preHandler: authenticate }, async (request, reply) => {
    const { interactionId } = parse(z.object({ interactionId: z.string().uuid() }).strict(), request.params);
    const sources = await repository.getInteractionSources(request.auth!.workspaceId, interactionId);
    return reply.send({ sources });
  });

  // Template version routes
  app.post('/templates', { preHandler: [authenticate, authorizeWorkspaceWrite] }, async (request, reply) => {
    const body = parse(createTemplateSchema, request.body);
    const templateVersion = await repository.createTemplateVersion({
      workspaceId: request.auth!.workspaceId,
      type: body.type,
      subject: body.subject,
      body: body.body,
      variables: body.variables,
    });
    return reply.status(201).send({ templateVersion });
  });

  app.get('/templates', { preHandler: authenticate }, async (request, reply) => {
    const query = parse(
      z.object({ type: templateTypeEnum.optional() }).strict(),
      request.query,
    );
    const templateVersions = await repository.listTemplateVersions(request.auth!.workspaceId, query.type);
    return reply.send({ templateVersions });
  });

  app.get('/templates/:templateVersionId', { preHandler: authenticate }, async (request, reply) => {
    const { templateVersionId } = parse(
      z.object({ templateVersionId: z.string().uuid() }).strict(),
      request.params,
    );
    const templateVersion = await repository.getTemplateVersion(request.auth!.workspaceId, templateVersionId);
    if (!templateVersion) throw new AppError('Template version not found', 404, 'NOT_FOUND');
    return reply.send({ templateVersion });
  });

  app.get('/templates/type/:type', { preHandler: authenticate }, async (request, reply) => {
    const { type } = parse(z.object({ type: templateTypeEnum }).strict(), request.params);
    const templateVersion = await repository.getLatestTemplateVersion(request.auth!.workspaceId, type);
    if (!templateVersion) throw new AppError('Template version not found', 404, 'NOT_FOUND');
    return reply.send({ templateVersion });
  });

  app.get('/templates/suggestions/:event', { preHandler: authenticate }, async (request, reply) => {
    const { event } = parse(
      z.object({ event: lifecycleTemplateEventEnum }).strict(),
      request.params,
    );
    const type = lifecycleTemplateTypeByEvent[event];
    const templateVersion = await repository.getLatestTemplateVersion(request.auth!.workspaceId, type);
    return reply.send({ event, templateVersion });
  });

  app.post('/templates/:templateVersionId/render', { preHandler: authenticate }, async (request, reply) => {
    const { templateVersionId } = parse(
      z.object({ templateVersionId: z.string().uuid() }).strict(),
      request.params,
    );
    const templateVersion = await repository.getTemplateVersion(request.auth!.workspaceId, templateVersionId);
    if (!templateVersion) throw new AppError('Template version not found', 404, 'NOT_FOUND');
    const context = parse(
      z.record(z.string()),
      request.body,
    );
    const expected = new Set(templateVersion.variables);
    const received = new Set(Object.keys(context));
    const missing = [...expected].filter((variable) => !received.has(variable));
    const extra = [...received].filter((variable) => !expected.has(variable));
    if (missing.length > 0 || extra.length > 0) {
      throw new AppError('Template context variables do not match the template version', 400, 'VALIDATION_ERROR', {
        missing,
        extra,
      });
    }
    let rendered: { subject: string; body: string };
    try {
      rendered = repository.renderTemplate(templateVersion, context);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid CCOS template render:')) {
        throw new AppError(error.message, 400, 'VALIDATION_ERROR');
      }
      throw error;
    }
    return reply.send({ rendered });
  });

}
