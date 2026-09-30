/**
 * Drizzle ORM schema — TikTok Shop market intelligence
 * Maps to PRD §8 Core domain model
 */

import {
  pgTable, pgEnum, uuid, varchar, text, integer, bigint,
  timestamp, boolean, jsonb, decimal, uniqueIndex, index,
  foreignKey, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ============================================================
// Enums
// ============================================================

export const metricClassificationEnum = pgEnum('metric_classification', [
  'observed', 'calculated', 'inferred', 'self-reported', 'unavailable',
]);

export const userRoleEnum = pgEnum('user_role', [
  'owner', 'admin', 'analyst', 'viewer',
]);

export const alertTriggerTypeEnum = pgEnum('alert_trigger_type', [
  'score_threshold', 'momentum', 'commission_change',
  'price_change', 'saturation', 'new_content',
]);

export const connectionStatusEnum = pgEnum('connection_status', [
  'active', 'expired', 'revoked',
]);

export const trendLifecycleEnum = pgEnum('trend_lifecycle', [
  'emerging', 'growing', 'mature', 'declining', 'insufficient-data',
]);

export const saturationLevelEnum = pgEnum('saturation_level', [
  'low', 'moderate', 'high', 'unknown',
]);

export const planCodeEnum = pgEnum('plan_code', [
  'free', 'creator', 'pro', 'agency',
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'product', 'creator', 'shop', 'video',
]);

export const ccosPartnershipTypeEnum = pgEnum('ccos_partnership_type', [
  'inbound_invite', 'outbound_prospecting', 'affiliate', 'paid_campaign', 'gifting',
]);

export const ccosPartnershipStatusEnum = pgEnum('ccos_partnership_status', [
  'lead', 'contacted', 'negotiating', 'active', 'waiting', 'paused', 'completed', 'declined', 'cancelled',
]);

export const ccosProductStatusEnum = pgEnum('ccos_product_status', [
  'proposed', 'selected', 'sample_requested', 'sample_approved', 'shipped', 'received',
  'content_queue', 'in_production', 'content_live', 'monitoring', 'declined', 'cancelled',
  'out_of_stock', 'replacement_needed', 'paused', 'completed',
]);

export const ccosContentStatusEnum = pgEnum('ccos_content_status', [
  'idea', 'planned', 'filming', 'editing', 'ready', 'scheduled', 'published',
  'ads_authorized', 'monitoring',
]);

export const ccosAdAuthorizationStatusEnum = pgEnum('ccos_ad_authorization_status', [
  'pending', 'authorized', 'unavailable',
]);

export const ccosInteractionDirectionEnum = pgEnum('ccos_interaction_direction', [
  'inbound', 'outbound', 'system',
]);

export const ccosTemplateTypeEnum = pgEnum('ccos_template_type', [
  'invite_first_contact', 'partnership_confirm', 'sample_confirm', 'receipt',
  'publication', 'ad_auth', 'followup_performance',
]);

export const ccosNextActionStatusEnum = pgEnum('ccos_next_action_status', [
  'open', 'in_progress', 'waiting', 'completed', 'cancelled',
]);

export const ccosPriorityEnum = pgEnum('ccos_priority', [
  'low', 'normal', 'high', 'urgent',
]);

// ============================================================
// Auth & users
// ============================================================

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  planCode: planCodeEnum('plan_code').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports for use across packages
export type Product = typeof products.$inferSelect;
export type ProductSnapshot = typeof productSnapshots.$inferSelect;
export type TrendSignal = typeof trendSignals.$inferSelect;
export type OpportunityScore = typeof opportunityScores.$inferSelect;

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  role: userRoleEnum('role').notNull().default('owner'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('users_email_idx').on(t.email),
  workspaceIdUnique: uniqueIndex('users_workspace_id_id_idx').on(t.workspaceId, t.id),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar('token', { length: 512 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// TikTok Shop connections
// ============================================================

export const tiktokConnections = pgTable('tiktok_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  marketplace: varchar('marketplace', { length: 8 }).notNull().default('BR'),
  accessToken: text('access_token').notNull(),      // encrypted at rest
  refreshToken: text('refresh_token').notNull(),    // encrypted at rest
  scopes: jsonb('scopes').notNull().$type<string[]>(),
  status: connectionStatusEnum('status').notNull().default('active'),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Products
// ============================================================

export const products = pgTable('products', {
  id: varchar('id', { length: 64 }).primaryKey(),    // TikTok Shop product ID
  marketplace: varchar('marketplace', { length: 8 }).notNull().default('BR'),
  title: varchar('title', { length: 512 }).notNull(),
  description: text('description'),
  categoryId: varchar('category_id', { length: 64 }),
  categoryPath: jsonb('category_path').$type<string[]>(),
  imageUrl: varchar('image_url', { length: 2048 }),
  shopId: varchar('shop_id', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  lastObservedAt: timestamp('last_observed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  marketplaceIdx: index('products_marketplace_idx').on(t.marketplace),
  categoryIdx: index('products_category_idx').on(t.categoryId),
  shopIdx: index('products_shop_idx').on(t.shopId),
}));

// ============================================================
// Product snapshots (time-series)
// ============================================================

export const productSnapshots = pgTable('product_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('BRL'),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 4 }).notNull(),  // 0.0 - 1.0
  stockSignal: varchar('stock_signal', { length: 32 }),
  rating: decimal('rating', { precision: 3, scale: 2 }),
  reviewCount: integer('review_count'),
  salesVolume: integer('sales_volume'),
  salesVelocity: decimal('sales_velocity', { precision: 12, scale: 4 }),
  classification: metricClassificationEnum('classification').notNull().default('observed'),
  provenance: jsonb('provenance'),
}, (t) => ({
  productTimeIdx: index('snapshots_product_time_idx').on(t.productId, t.observedAt),
}));

// ============================================================
// Shops
// ============================================================

export const shops = pgTable('shops', {
  id: varchar('id', { length: 64 }).primaryKey(),
  marketplace: varchar('marketplace', { length: 8 }).notNull().default('BR'),
  name: varchar('name', { length: 255 }).notNull(),
  logoUrl: varchar('logo_url', { length: 2048 }),
  rating: decimal('rating', { precision: 3, scale: 2 }),
  productCount: integer('product_count'),
  classification: metricClassificationEnum('classification').notNull().default('observed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Creators
// ============================================================

export const creators = pgTable('creators', {
  id: varchar('id', { length: 64 }).primaryKey(),
  marketplace: varchar('marketplace', { length: 8 }).notNull().default('BR'),
  displayName: varchar('display_name', { length: 255 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 2048 }),
  followerCount: integer('follower_count'),
  affiliateStatus: varchar('affiliate_status', { length: 32 }),
  classification: metricClassificationEnum('classification').notNull().default('observed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Videos
// ============================================================

export const videos = pgTable('videos', {
  id: varchar('id', { length: 64 }).primaryKey(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id),
  creatorId: varchar('creator_id', { length: 64 }).notNull().references(() => creators.id),
  title: varchar('title', { length: 512 }),
  thumbnailUrl: varchar('thumbnail_url', { length: 2048 }),
  duration: integer('duration'),
  likeCount: integer('like_count'),
  shareCount: integer('share_count'),
  viewCount: integer('view_count'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productIdx: index('videos_product_idx').on(t.productId),
  creatorIdx: index('videos_creator_idx').on(t.creatorId),
}));

// ============================================================
// Product <-> Creator relationships
// ============================================================

export const productCreatorLinks = pgTable('product_creator_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  creatorId: varchar('creator_id', { length: 64 }).notNull().references(() => creators.id, { onDelete: 'cascade' }),
  firstObservedAt: timestamp('first_observed_at', { withTimezone: true }).notNull().defaultNow(),
  lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productCreatorIdx: uniqueIndex('pcl_product_creator_idx').on(t.productId, t.creatorId),
}));

// ============================================================
// Opportunity scores
// ============================================================

export const opportunityScores = pgTable('opportunity_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 8 }).notNull().default('v1'),
  marketplace: varchar('marketplace', { length: 8 }).notNull(),
  categoryId: varchar('category_id', { length: 64 }),
  score: integer('score').notNull(),                  // 0-100
  confidence: varchar('confidence', { length: 8 }).notNull(),  // low/medium/high
  components: jsonb('components').notNull(),
  cohort: varchar('cohort', { length: 255 }).notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productVersionIdx: uniqueIndex('os_product_version_idx').on(t.productId, t.version, t.calculatedAt),
}));

// ============================================================
// Saturation scores
// ============================================================

export const saturationScores = pgTable('saturation_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  version: varchar('version', { length: 8 }).notNull().default('v1'),
  marketplace: varchar('marketplace', { length: 8 }).notNull(),
  level: saturationLevelEnum('level').notNull(),
  score: integer('score').notNull(),
  factors: jsonb('factors').notNull(),
  explanation: text('explanation').notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productVersionIdx: uniqueIndex('ss_product_version_idx').on(t.productId, t.version, t.calculatedAt),
}));

// ============================================================
// Trend signals
// ============================================================

export const trendSignals = pgTable('trend_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: varchar('product_id', { length: 64 }).notNull().references(() => products.id, { onDelete: 'cascade' }),
  window: varchar('window', { length: 8 }).notNull(),
  growthRate: decimal('growth_rate', { precision: 10, scale: 4 }).notNull(),
  acceleration: decimal('acceleration', { precision: 10, scale: 4 }).notNull(),
  lifecycle: trendLifecycleEnum('lifecycle').notNull(),
  confidence: varchar('confidence', { length: 8 }).notNull(),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productWindowIdx: uniqueIndex('ts_product_window_idx').on(t.productId, t.window, t.calculatedAt),
}));

// ============================================================
// Watchlists
// ============================================================

export const watchlists = pgTable('watchlists', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const watchlistItems = pgTable('watchlist_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  watchlistId: uuid('watchlist_id').notNull().references(() => watchlists.id, { onDelete: 'cascade' }),
  entityType: entityTypeEnum('entity_type').notNull(),
  entityId: varchar('entity_id', { length: 64 }).notNull(),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  watchlistEntityIdx: uniqueIndex('wli_watchlist_entity_idx').on(t.watchlistId, t.entityType, t.entityId),
}));

// ============================================================
// Alerts
// ============================================================

export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  triggerType: alertTriggerTypeEnum('trigger_type').notNull(),
  conditions: jsonb('conditions').notNull(),
  cooldownMinutes: integer('cooldown_minutes').notNull().default(60),
  deliveryChannels: jsonb('delivery_channels').$type<string[]>().notNull().default(['in_app']),
  active: boolean('active').notNull().default(true),
  lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alertHistory = pgTable('alert_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertRuleId: uuid('alert_rule_id').notNull().references(() => alertRules.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  triggerData: jsonb('trigger_data').notNull(),
  delivered: boolean('delivered').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// Creator Commerce Operating System (CCOS)
// ============================================================

export const ccosStores = pgTable('ccos_stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdUnique: uniqueIndex('ccos_stores_workspace_id_id_idx').on(t.workspaceId, t.id),
  workspaceNameIdx: index('ccos_stores_workspace_name_idx').on(t.workspaceId, t.name),
}));

export const ccosPartnerships = pgTable('ccos_partnerships', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id').notNull(),
  type: ccosPartnershipTypeEnum('type').notNull(),
  status: ccosPartnershipStatusEnum('status').notNull().default('lead'),
  title: varchar('title', { length: 255 }),
  terms: text('terms'),
  priority: ccosPriorityEnum('priority').notNull().default('normal'),
  lastContactAt: timestamp('last_contact_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdUnique: uniqueIndex('ccos_partnerships_workspace_id_id_idx').on(t.workspaceId, t.id),
  workspaceStoreIdx: index('ccos_partnerships_workspace_store_idx').on(t.workspaceId, t.storeId),
  workspaceStoreFk: foreignKey({
    name: 'ccos_partnerships_workspace_store_fk',
    columns: [t.workspaceId, t.storeId],
    foreignColumns: [ccosStores.workspaceId, ccosStores.id],
  }).onDelete('cascade'),
}));

export const ccosProducts = pgTable('ccos_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  partnershipId: uuid('partnership_id').notNull(),
  name: varchar('name', { length: 512 }).notNull(),
  sku: varchar('sku', { length: 128 }),
  productUrl: varchar('product_url', { length: 2048 }),
  priceAmount: decimal('price_amount', { precision: 20, scale: 6 }),
  currency: varchar('currency', { length: 3 }),
  commissionRate: decimal('commission_rate', { precision: 9, scale: 6 }),
  commissionAmount: decimal('commission_amount', { precision: 20, scale: 6 }),
  stockState: varchar('stock_state', { length: 64 }),
  status: ccosProductStatusEnum('status').notNull().default('proposed'),
  trackingCode: varchar('tracking_code', { length: 255 }),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  priority: ccosPriorityEnum('priority').notNull().default('normal'),
  source: varchar('source', { length: 64 }).notNull().default('manual'),
  provenance: jsonb('provenance'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdUnique: uniqueIndex('ccos_products_workspace_id_id_idx').on(t.workspaceId, t.id),
  workspacePartnershipIdx: index('ccos_products_workspace_partnership_idx').on(t.workspaceId, t.partnershipId),
  productionQueueIdx: index('ccos_products_workspace_status_id_idx').on(t.workspaceId, t.status, t.id),
  workspacePartnershipFk: foreignKey({
    name: 'ccos_products_workspace_partnership_fk',
    columns: [t.workspaceId, t.partnershipId],
    foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id],
  }).onDelete('cascade'),
}));

export const ccosContents = pgTable('ccos_contents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull(),
  status: ccosContentStatusEnum('status').notNull().default('idea'),
  platform: varchar('platform', { length: 64 }).notNull(),
  format: varchar('format', { length: 64 }),
  concept: text('concept'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publicationUrl: varchar('publication_url', { length: 2048 }),
  adAuthorizationStatus: ccosAdAuthorizationStatusEnum('ad_authorization_status'),
  adAuthorizationCode: varchar('ad_authorization_code', { length: 255 }),
  adAuthorizationCreatedAt: timestamp('ad_authorization_created_at', { withTimezone: true }),
  adAuthorizationExpiresAt: timestamp('ad_authorization_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdUnique: uniqueIndex('ccos_contents_workspace_id_id_idx').on(t.workspaceId, t.id),
  workspaceProductIdx: index('ccos_contents_workspace_product_idx').on(t.workspaceId, t.productId),
  workspaceProductFk: foreignKey({
    name: 'ccos_contents_workspace_product_fk',
    columns: [t.workspaceId, t.productId],
    foreignColumns: [ccosProducts.workspaceId, ccosProducts.id],
  }).onDelete('cascade'),
  adAuthorizationDetails: check('ccos_contents_ad_authorization_details', sql`
    (${t.adAuthorizationStatus} = 'authorized' AND ${t.adAuthorizationCode} IS NOT NULL AND ${t.adAuthorizationCreatedAt} IS NOT NULL)
    OR (${t.adAuthorizationStatus} IN ('pending', 'unavailable') AND ${t.adAuthorizationCode} IS NULL
        AND ${t.adAuthorizationCreatedAt} IS NULL AND ${t.adAuthorizationExpiresAt} IS NULL)
    OR (${t.adAuthorizationStatus} IS NULL AND ${t.adAuthorizationCode} IS NULL
        AND ${t.adAuthorizationCreatedAt} IS NULL AND ${t.adAuthorizationExpiresAt} IS NULL)
  `),
  adAuthorizationExpiry: check('ccos_contents_ad_authorization_expiry', sql`
    ${t.adAuthorizationExpiresAt} IS NULL OR ${t.adAuthorizationExpiresAt} >= ${t.adAuthorizationCreatedAt}
  `),
  adsAuthorizedLifecycle: check('ccos_contents_ads_authorized_lifecycle', sql`
    ${t.status} <> 'ads_authorized' OR ${t.adAuthorizationStatus} IS NOT DISTINCT FROM 'authorized'
  `),
}));

export const ccosInteractions = pgTable('ccos_interactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  partnershipId: uuid('partnership_id').notNull(),
  direction: ccosInteractionDirectionEnum('direction').notNull(),
  channel: varchar('channel', { length: 64 }).notNull(),
  summary: text('summary').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 64 }).notNull().default('manual'),
  templateVersionId: uuid('template_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdUnique: uniqueIndex('ccos_interactions_workspace_id_id_idx').on(t.workspaceId, t.id),
  workspacePartnershipIdx: index('ccos_interactions_workspace_partnership_idx').on(t.workspaceId, t.partnershipId, t.occurredAt),
  workspacePartnershipFk: foreignKey({
    name: 'ccos_interactions_workspace_partnership_fk',
    columns: [t.workspaceId, t.partnershipId],
    foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id],
  }).onDelete('cascade'),
  workspaceTemplateVersionFk: foreignKey({
    name: 'ccos_interactions_workspace_template_version_fk',
    columns: [t.workspaceId, t.templateVersionId],
    foreignColumns: [ccosTemplateVersions.workspaceId, ccosTemplateVersions.id],
  }).onDelete('no action'),
}));

export const ccosTemplateVersions = pgTable('ccos_template_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  type: ccosTemplateTypeEnum('type').notNull(),
  version: integer('version').notNull().default(1),
  subject: varchar('subject', { length: 512 }).notNull(),
  body: text('body').notNull(),
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceTypeVersionIdx: uniqueIndex('ccos_template_versions_workspace_type_version_idx').on(t.workspaceId, t.type, t.version),
  workspaceTypeIdx: index('ccos_template_versions_workspace_type_idx').on(t.workspaceId, t.type),
  workspaceIdUnique: uniqueIndex('ccos_template_versions_workspace_id_id_idx').on(t.workspaceId, t.id),
}));

export const ccosTemplateUsage = pgTable('ccos_template_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  templateVersionId: uuid('template_version_id').notNull(),
  interactionId: uuid('interaction_id').notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceIdIdx: index('ccos_template_usage_workspace_idx').on(t.workspaceId),
  templateVersionIdx: index('ccos_template_usage_template_version_idx').on(t.templateVersionId),
  interactionIdx: uniqueIndex('ccos_template_usage_interaction_idx').on(t.interactionId),
  templateVersionFk: foreignKey({
    name: 'ccos_template_usage_workspace_template_version_fk',
    columns: [t.workspaceId, t.templateVersionId],
    foreignColumns: [ccosTemplateVersions.workspaceId, ccosTemplateVersions.id],
  }).onDelete('no action'),
  interactionFk: foreignKey({
    name: 'ccos_template_usage_workspace_interaction_fk',
    columns: [t.workspaceId, t.interactionId],
    foreignColumns: [ccosInteractions.workspaceId, ccosInteractions.id],
  }).onDelete('cascade'),
}));

export const ccosInteractionSources = pgTable('ccos_interaction_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  interactionId: uuid('interaction_id').notNull(),
  sourceType: varchar('source_type', { length: 64 }).notNull(), // 'product', 'content', 'partnership', 'action', 'template_version'
  sourceId: uuid('source_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceInteractionIdx: index('ccos_interaction_sources_workspace_interaction_idx').on(t.workspaceId, t.interactionId),
  interactionFk: foreignKey({
    name: 'ccos_interaction_sources_workspace_interaction_fk',
    columns: [t.workspaceId, t.interactionId],
    foreignColumns: [ccosInteractions.workspaceId, ccosInteractions.id],
  }).onDelete('cascade'),
}));

export const ccosNextActions = pgTable('ccos_next_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id'),
  partnershipId: uuid('partnership_id'),
  productId: uuid('product_id'),
  contentId: uuid('content_id'),
  interactionId: uuid('interaction_id'),
  title: varchar('title', { length: 255 }).notNull(),
  ruleKey: varchar('rule_key', { length: 128 }),
  dedupeKey: varchar('dedupe_key', { length: 255 }),
  waitingReason: text('waiting_reason'),
  resolutionReason: text('resolution_reason'),
  status: ccosNextActionStatusEnum('status').notNull().default('open'),
  priority: ccosPriorityEnum('priority').notNull().default('normal'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  ownerUserId: uuid('owner_user_id'),
  generatedAutomatically: boolean('generated_automatically').notNull().default(false),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceStatusDueIdx: index('ccos_next_actions_workspace_status_due_idx').on(t.workspaceId, t.status, t.dueAt),
  workspaceIdUnique: uniqueIndex('ccos_next_actions_workspace_id_idx').on(t.workspaceId, t.id),
  activeGeneratedDedupe: uniqueIndex('ccos_next_actions_active_generated_dedupe_idx')
    .on(t.workspaceId, t.dedupeKey)
    .where(sql`${t.generatedAutomatically} = true AND ${t.status} IN ('open', 'in_progress', 'waiting')`),
  exactlyOneTarget: check('ccos_next_actions_exactly_one_target', sql`num_nonnulls(${t.storeId}, ${t.partnershipId}, ${t.productId}, ${t.contentId}, ${t.interactionId}) = 1`),
  workspaceOwnerFk: foreignKey({
    name: 'ccos_next_actions_workspace_owner_fk',
    columns: [t.workspaceId, t.ownerUserId],
    foreignColumns: [users.workspaceId, users.id],
  }).onDelete('restrict'),
  workspaceStoreFk: foreignKey({
    name: 'ccos_next_actions_workspace_store_fk', columns: [t.workspaceId, t.storeId],
    foreignColumns: [ccosStores.workspaceId, ccosStores.id],
  }).onDelete('cascade'),
  workspacePartnershipFk: foreignKey({
    name: 'ccos_next_actions_workspace_partnership_fk', columns: [t.workspaceId, t.partnershipId],
    foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id],
  }).onDelete('cascade'),
  workspaceProductFk: foreignKey({
    name: 'ccos_next_actions_workspace_product_fk', columns: [t.workspaceId, t.productId],
    foreignColumns: [ccosProducts.workspaceId, ccosProducts.id],
  }).onDelete('cascade'),
  workspaceContentFk: foreignKey({
    name: 'ccos_next_actions_workspace_content_fk', columns: [t.workspaceId, t.contentId],
    foreignColumns: [ccosContents.workspaceId, ccosContents.id],
  }).onDelete('cascade'),
  workspaceInteractionFk: foreignKey({
    name: 'ccos_next_actions_workspace_interaction_fk', columns: [t.workspaceId, t.interactionId],
    foreignColumns: [ccosInteractions.workspaceId, ccosInteractions.id],
  }).onDelete('cascade'),
}));

export const ccosMetricSnapshots = pgTable('ccos_metric_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id'),
  partnershipId: uuid('partnership_id'),
  productId: uuid('product_id'),
  contentId: uuid('content_id'),
  interactionId: uuid('interaction_id'),
  metricKey: varchar('metric_key', { length: 128 }).notNull(),
  numericValue: decimal('numeric_value', { precision: 20, scale: 6 }),
  textValue: text('text_value'),
  unit: varchar('unit', { length: 32 }),
  classification: metricClassificationEnum('classification').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  source: varchar('source', { length: 64 }).notNull(),
  provenance: jsonb('provenance').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceMetricTimeIdx: index('ccos_metric_snapshots_metric_time_idx')
    .on(t.workspaceId, t.metricKey, t.observedAt),
  exactlyOneTarget: check('ccos_metric_snapshots_exactly_one_target', sql`num_nonnulls(${t.storeId}, ${t.partnershipId}, ${t.productId}, ${t.contentId}, ${t.interactionId}) = 1`),
  workspaceStoreFk: foreignKey({
    name: 'ccos_metric_snapshots_workspace_store_fk', columns: [t.workspaceId, t.storeId],
    foreignColumns: [ccosStores.workspaceId, ccosStores.id],
  }).onDelete('cascade'),
  workspacePartnershipFk: foreignKey({
    name: 'ccos_metric_snapshots_workspace_partnership_fk', columns: [t.workspaceId, t.partnershipId],
    foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id],
  }).onDelete('cascade'),
  workspaceProductFk: foreignKey({
    name: 'ccos_metric_snapshots_workspace_product_fk', columns: [t.workspaceId, t.productId],
    foreignColumns: [ccosProducts.workspaceId, ccosProducts.id],
  }).onDelete('cascade'),
  workspaceContentFk: foreignKey({
    name: 'ccos_metric_snapshots_workspace_content_fk', columns: [t.workspaceId, t.contentId],
    foreignColumns: [ccosContents.workspaceId, ccosContents.id],
  }).onDelete('cascade'),
  workspaceInteractionFk: foreignKey({
    name: 'ccos_metric_snapshots_workspace_interaction_fk', columns: [t.workspaceId, t.interactionId],
    foreignColumns: [ccosInteractions.workspaceId, ccosInteractions.id],
  }).onDelete('cascade'),
}));

// Human-assessed relationship potential, independent of delivery/publication lifecycle.
export const ccosOpportunityStateEnum = pgEnum('ccos_opportunity_state', ['UNASSESSED', 'TESTING', 'LOW_POTENTIAL', 'PROMISING', 'WINNER', 'SCALE', 'PAUSED']);
export const ccosOpportunityStates = pgTable('ccos_opportunity_states', {
  partnershipId: uuid('partnership_id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  state: ccosOpportunityStateEnum('state').notNull().default('UNASSESSED'),
  revision: integer('revision').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  partnershipFk: foreignKey({ name: 'ccos_opportunity_states_workspace_partnership_fk', columns: [t.workspaceId, t.partnershipId], foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id] }).onDelete('cascade'),
  revisionCheck: check('ccos_opportunity_states_revision_check', sql`${t.revision} >= 0`),
}));

export const ccosOpportunityHistory = pgTable('ccos_opportunity_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  partnershipId: uuid('partnership_id').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  revision: integer('revision').notNull(),
  previousState: ccosOpportunityStateEnum('previous_state').notNull(),
  newState: ccosOpportunityStateEnum('new_state').notNull(),
  actionKind: varchar('action_kind', { length: 32 }),
  actionId: uuid('action_id'),
  reason: text('reason').notNull(),
  evidence: jsonb('evidence').notNull(),
  policyVersion: varchar('policy_version', { length: 64 }).notNull().default('manual-v1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  revisionUnique: uniqueIndex('ccos_opportunity_history_revision_idx').on(t.workspaceId, t.partnershipId, t.revision),
  partnershipFk: foreignKey({ name: 'ccos_opportunity_history_workspace_partnership_fk', columns: [t.workspaceId, t.partnershipId], foreignColumns: [ccosPartnerships.workspaceId, ccosPartnerships.id] }).onDelete('cascade'),
  actorFk: foreignKey({ name: 'ccos_opportunity_history_workspace_actor_fk', columns: [t.workspaceId, t.actorUserId], foreignColumns: [users.workspaceId, users.id] }).onDelete('no action'),
  // Restrict deleting an action once it has become an audited opportunity decision.
  actionFk: foreignKey({ name: 'ccos_opportunity_history_workspace_action_fk', columns: [t.workspaceId, t.actionId], foreignColumns: [ccosNextActions.workspaceId, ccosNextActions.id] }).onDelete('no action'),
  shapeCheck: check('ccos_opportunity_history_shape_check', sql`${t.revision} > 0 AND length(trim(${t.reason})) BETWEEN 1 AND 2000 AND jsonb_typeof(${t.evidence}) = 'object' AND ${t.evidence} <> '{}'::jsonb AND length(${t.evidence}::text) <= 20000 AND ${t.policyVersion} = 'manual-v1' AND ((${t.actionKind} IS NULL AND ${t.actionId} IS NULL AND ${t.previousState} <> ${t.newState}) OR (${t.actionKind} IS NOT NULL AND ${t.actionKind} IN ('follow_up','replenishment','additional_sku','new_creative','expansion') AND ${t.actionId} IS NOT NULL AND ${t.previousState} = ${t.newState}))`),
}));

export const ccosProductionQueueState = pgTable('ccos_production_queue_state', {
  workspaceId: uuid('workspace_id').primaryKey().references(() => workspaces.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
  productIds: jsonb('product_ids').notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  revisionCheck: check('ccos_queue_state_revision_check', sql`${t.revision} >= 0`),
  orderCheck: check('ccos_queue_state_order_check', sql`jsonb_typeof(${t.productIds}) = 'array'`),
}));

export const ccosProductionQueueAudit = pgTable('ccos_production_queue_audit', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  previousOrder: jsonb('previous_order').notNull(),
  newOrder: jsonb('new_order').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  revisionUnique: uniqueIndex('ccos_queue_audit_workspace_revision_idx').on(t.workspaceId, t.revision),
  actorFk: foreignKey({ name: 'ccos_queue_audit_workspace_actor_fk', columns: [t.workspaceId, t.actorUserId], foreignColumns: [users.workspaceId, users.id] }).onDelete('restrict'),
  shapeCheck: check('ccos_queue_audit_shape_check', sql`${t.revision} > 0 AND length(trim(${t.reason})) > 0 AND jsonb_typeof(${t.previousOrder}) = 'array' AND jsonb_typeof(${t.newOrder}) = 'array'`),
}));

// Immutable-at-a-timestamp performance observations for a published content item.
// A repeated write to the same content/time key is an upsert, not another snapshot.
export const ccosPerformanceSnapshots = pgTable('ccos_performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  contentId: uuid('content_id').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  views: bigint('views', { mode: 'number' }),
  clicks: bigint('clicks', { mode: 'number' }),
  orders: bigint('orders', { mode: 'number' }),
  gmv: decimal('gmv', { precision: 20, scale: 6 }),
  commission: decimal('commission', { precision: 20, scale: 6 }),
  conversion: decimal('conversion', { precision: 12, scale: 8 }),
  currency: varchar('currency', { length: 3 }),
  classifications: jsonb('classifications').notNull(),
  provenance: jsonb('provenance').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  workspaceContentTimeUnique: uniqueIndex('ccos_performance_snapshots_content_time_idx')
    .on(t.workspaceId, t.contentId, t.observedAt),
  workspaceTimeIdx: index('ccos_performance_snapshots_workspace_time_idx')
    .on(t.workspaceId, t.observedAt),
  workspaceContentFk: foreignKey({
    name: 'ccos_performance_snapshots_workspace_content_fk',
    columns: [t.workspaceId, t.contentId],
    foreignColumns: [ccosContents.workspaceId, ccosContents.id],
  }).onDelete('cascade'),
  nonNegativeCounts: check('ccos_performance_snapshots_non_negative_counts', sql`
    (${t.views} IS NULL OR ${t.views} >= 0) AND (${t.clicks} IS NULL OR ${t.clicks} >= 0)
    AND (${t.orders} IS NULL OR ${t.orders} >= 0)
  `),
  nonNegativeAmounts: check('ccos_performance_snapshots_non_negative_amounts', sql`
    (${t.gmv} IS NULL OR ${t.gmv} >= 0) AND (${t.commission} IS NULL OR ${t.commission} >= 0)
    AND (${t.conversion} IS NULL OR (${t.conversion} >= 0 AND ${t.conversion} <= 1))
  `),
  currencyRequired: check('ccos_performance_snapshots_currency_required', sql`
    ((${t.gmv} IS NULL AND ${t.commission} IS NULL)
      OR (${t.currency} IS NOT NULL AND ${t.currency} ~ '^[A-Z]{3}$'))
  `),
  classificationProvenanceShape: check('ccos_performance_snapshots_classification_provenance_shape', sql`
    COALESCE((jsonb_typeof(${t.classifications}) = 'object'
    AND ${t.classifications} ?& ARRAY['views','clicks','orders','gmv','commission','conversion']
    AND (${t.classifications} - ARRAY['views','clicks','orders','gmv','commission','conversion']) = '{}'::jsonb
    AND ${t.provenance}->>'schemaVersion' = '1'
    AND length(${t.provenance}->>'source') BETWEEN 1 AND 64
    AND jsonb_typeof(${t.provenance}->'metrics') = 'object'
    AND (${t.provenance}->'metrics') ?& ARRAY['views','clicks','orders','gmv','commission','conversion']
    AND ((${t.provenance}->'metrics') - ARRAY['views','clicks','orders','gmv','commission','conversion']) = '{}'::jsonb
    AND jsonb_typeof(${t.provenance}->'metrics'->'views') = 'object'
    AND jsonb_typeof(${t.provenance}->'metrics'->'clicks') = 'object'
    AND jsonb_typeof(${t.provenance}->'metrics'->'orders') = 'object'
    AND jsonb_typeof(${t.provenance}->'metrics'->'gmv') = 'object'
    AND jsonb_typeof(${t.provenance}->'metrics'->'commission') = 'object'
    AND jsonb_typeof(${t.provenance}->'metrics'->'conversion') = 'object'
    AND ${t.provenance}->'metrics'->'views'->>'classification' = ${t.classifications}->>'views'
    AND ${t.provenance}->'metrics'->'clicks'->>'classification' = ${t.classifications}->>'clicks'
    AND ${t.provenance}->'metrics'->'orders'->>'classification' = ${t.classifications}->>'orders'
    AND ${t.provenance}->'metrics'->'gmv'->>'classification' = ${t.classifications}->>'gmv'
    AND ${t.provenance}->'metrics'->'commission'->>'classification' = ${t.classifications}->>'commission'
    AND ${t.provenance}->'metrics'->'conversion'->>'classification' = ${t.classifications}->>'conversion'
    AND ${t.provenance}->'metrics'->'views'->>'source' = ${t.provenance}->>'source'
    AND ${t.provenance}->'metrics'->'clicks'->>'source' = ${t.provenance}->>'source'
    AND ${t.provenance}->'metrics'->'orders'->>'source' = ${t.provenance}->>'source'
    AND ${t.provenance}->'metrics'->'gmv'->>'source' = ${t.provenance}->>'source'
    AND ${t.provenance}->'metrics'->'commission'->>'source' = ${t.provenance}->>'source'
    AND ${t.provenance}->'metrics'->'conversion'->>'source' = ${t.provenance}->>'source'
    AND (${t.provenance}->'metrics'->'views') ? 'provenance'
    AND (${t.provenance}->'metrics'->'clicks') ? 'provenance'
    AND (${t.provenance}->'metrics'->'orders') ? 'provenance'
    AND (${t.provenance}->'metrics'->'gmv') ? 'provenance'
    AND (${t.provenance}->'metrics'->'commission') ? 'provenance'
    AND (${t.provenance}->'metrics'->'conversion') ? 'provenance'
    AND ${t.classifications}->>'views' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ${t.classifications}->>'clicks' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ${t.classifications}->>'orders' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ${t.classifications}->>'gmv' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ${t.classifications}->>'commission' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ${t.classifications}->>'conversion' IN ('observed','calculated','inferred','self-reported','unavailable')
    AND ((${t.views} IS NULL) = (${t.classifications}->>'views' = 'unavailable'))
    AND ((${t.clicks} IS NULL) = (${t.classifications}->>'clicks' = 'unavailable'))
    AND ((${t.orders} IS NULL) = (${t.classifications}->>'orders' = 'unavailable'))
    AND ((${t.gmv} IS NULL) = (${t.classifications}->>'gmv' = 'unavailable'))
    AND ((${t.commission} IS NULL) = (${t.classifications}->>'commission' = 'unavailable'))
    AND ((${t.conversion} IS NULL) = (${t.classifications}->>'conversion' = 'unavailable'))
  ), FALSE)
  `),
}));

// ============================================================
// OAuth state and probe result tables
// ============================================================

export const oauthStates = pgTable('oauth_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  stateHash: varchar('state_hash', { length: 64 }).notNull(),
  sessionHash: varchar('session_hash', { length: 64 }).notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
}, (t) => ({
  uniqueStateHash: uniqueIndex('oauth_states_state_hash_idx').on(t.stateHash),
  expiredStates: index('oauth_states_expired_idx').on(t.expiresAt),
}));

export const oauthProbeResults = pgTable('oauth_probe_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  resultIdHash: varchar('result_id_hash', { length: 64 }).notNull(),
  sessionHash: varchar('session_hash', { length: 64 }).notNull(),
  data: jsonb('data').notNull(),
  scopes: varchar('scopes', { length: 255 }).notNull().default(''),
  bothSucceeded: boolean('both_succeeded').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
}, (t) => ({
  uniqueResultIdHash: uniqueIndex('oauth_probe_results_result_id_hash_idx').on(t.resultIdHash),
  expiredResults: index('oauth_probe_results_expired_idx').on(t.expiresAt),
}));

export type OAuthState = typeof oauthStates.$inferSelect;
export type OAuthProbeResult = typeof oauthProbeResults.$inferSelect;

export type CCOSTemplateVersion = typeof ccosTemplateVersions.$inferSelect;
export type CCOSTemplateUsage = typeof ccosTemplateUsage.$inferSelect;
export type CCOInteractionSource = typeof ccosInteractionSources.$inferSelect;
