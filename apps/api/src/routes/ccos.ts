import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CCOSRepository,
  type CCOSPartnershipRecord,
  type CCOSProductRecord,
  type CCOSStoreRecord,
  type CreateCCOSPartnershipInput,
  type CreateCCOSProductInput,
  type CreateCCOSStoreInput,
  type UpdateCCOSPartnershipInput,
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
const decimalValue = z.string().regex(/^\d+(?:\.\d{1,6})?$/, 'Must be a non-negative decimal with up to 6 places');
const dateValue: z.ZodType<Date, z.ZodTypeDef, unknown> = z.preprocess(
  (value) => typeof value === 'string' ? new Date(value) : value,
  z.date(),
);
const storeParamsSchema = z.object({ storeId: z.string().uuid() }).strict();
const partnershipParamsSchema = z.object({ partnershipId: z.string().uuid() }).strict();
const productParamsSchema = z.object({ productId: z.string().uuid() }).strict();

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
  priceAmount: decimalValue.optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(),
  commissionRate: decimalValue.optional(),
  commissionAmount: decimalValue.optional(),
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
  priceAmount: decimalValue.nullable().optional(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).nullable().optional(),
  commissionRate: decimalValue.nullable().optional(),
  commissionAmount: decimalValue.nullable().optional(),
  stockState: z.string().trim().min(1).max(64).nullable().optional(),
  status: productStatus.optional(),
  trackingCode: z.string().trim().min(1).max(255).nullable().optional(),
  shippedAt: dateValue.nullable().optional(),
  receivedAt: dateValue.nullable().optional(),
  priority: priority.optional(),
  provenance: z.unknown().optional(),
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
}
