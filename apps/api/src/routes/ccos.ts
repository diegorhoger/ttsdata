import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CCOSRepository,
  type CCOSContentRecord,
  type CCOSNextActionRecord,
  type CCOSPartnershipRecord,
  type CCOSProductRecord,
  type CCOSStoreRecord,
  type CreateCCOSPartnershipInput,
  type CreateCCOSContentInput,
  type CreateCCOSNextActionInput,
  type CreateCCOSProductInput,
  type CreateCCOSStoreInput,
  type UpdateCCOSPartnershipInput,
  type UpdateCCOSContentInput,
  type UpdateCCOSNextActionInput,
  type UpdateCCOSProductInput,
  type UpdateCCOSStoreInput,
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
}).strict().refine((body) => Object.keys(body).length > 0, 'At least one field is required');

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
};

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
  authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export async function registerCCOSRoutes(app: FastifyInstance, options: CCOSRouteOptions = {}) {
  const repository = options.repository ?? new CCOSRepository(pool);
  const authenticate = options.authenticate ?? requireAuth;
  const authorizeWorkspaceWrite = requireRoles('owner', 'admin');

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
}
