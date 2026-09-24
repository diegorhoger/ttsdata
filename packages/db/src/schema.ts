/**
 * Drizzle ORM schema — TikTok Shop market intelligence
 * Maps to PRD §8 Core domain model
 */

import {
  pgTable, pgEnum, uuid, varchar, text, integer, bigint,
  timestamp, boolean, jsonb, decimal, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

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
