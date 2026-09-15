/**
 * Metric classification — every displayed metric MUST carry one of these.
 * PRD §9: Observed, Calculated, Inferred, Self-reported, Unavailable
 */
export type MetricClassification =
  | 'observed'
  | 'calculated'
  | 'inferred'
  | 'self-reported'
  | 'unavailable';

/**
 * Data provenance — source, retrieval time, marketplace, scope context.
 * PRD §8: DataProvenance entity
 */
export interface DataProvenance {
  source: string;                    // e.g. "tiktok_shop_api:v202401"
  endpoint: string;                  // e.g. "/product/202309/products/"
  retrievedAt: string;               // ISO 8601 UTC
  marketplace: string;               // e.g. "BR"
  scopeContext: string;              // e.g. "partner_discovery" | "seller_authorized"
  metricClassification: MetricClassification;
  rawPayloadRef?: string;            // bounded debugging/audit retention
}

/**
 * WithProvenance — wrapper that attaches provenance to any value
 */
export interface WithProvenance<T> {
  value: T;
  provenance: DataProvenance;
  classification: MetricClassification;
}

// ============================================================
// Domain entities — PRD §8 Core domain model
// ============================================================

export interface Marketplace {
  code: string;                      // "BR", "US", etc.
  currency: string;                  // "BRL"
  name: string;
}

export interface Product {
  id: string;                        // TikTok Shop product ID (source identifier)
  marketplace: string;
  title: string;
  description?: string;
  categoryId?: string;
  categoryPath?: string[];
  imageUrl?: string;
  shopId: string;
  status: 'active' | 'inactive' | 'suspended' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

export interface ProductSnapshot {
  id: string;
  productId: string;
  observedAt: string;                // When this state was observed
  price: WithProvenance<number>;
  currency: string;
  commissionRate: WithProvenance<number>;  // 0.0 - 1.0
  stockSignal?: WithProvenance<'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown'>;
  rating?: WithProvenance<number>;
  reviewCount?: WithProvenance<number>;
  salesVolume?: WithProvenance<number>;    // Observed or inferred
  salesVelocity?: WithProvenance<number>;  // Calculated
}

export interface Shop {
  id: string;
  marketplace: string;
  name: string;
  logoUrl?: string;
  rating?: WithProvenance<number>;
  productCount?: WithProvenance<number>;
  createdAt: string;
  updatedAt: string;
}

export interface Creator {
  id: string;
  marketplace: string;
  displayName: string;
  avatarUrl?: string;
  followerCount?: WithProvenance<number>;
  affiliateStatus?: 'active' | 'inactive' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  productId: string;
  creatorId: string;
  title?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  duration?: number;                 // seconds
  likeCount?: WithProvenance<number>;
  shareCount?: WithProvenance<number>;
  viewCount?: WithProvenance<number>;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Scoring — PRD §10 Initial scoring model
// ============================================================

export interface ScoreComponent {
  name: string;
  weight: number;                    // 0.0 - 1.0
  rawValue: number;
  normalizedValue: number;           // 0-100 after cohort normalization
  contribution: number;              // weight * normalizedValue
  explanation: string;
}

export interface OpportunityScore {
  version: string;                   // "v1"
  productId: string;
  marketplace: string;
  categoryId?: string;
  score: number;                     // 0-100
  confidence: 'low' | 'medium' | 'high';
  components: ScoreComponent[];
  calculatedAt: string;
  cohort: string;                    // marketplace + category
}

export type SaturationLevel = 'low' | 'moderate' | 'high' | 'unknown';

export interface SaturationScore {
  version: string;
  productId: string;
  marketplace: string;
  level: SaturationLevel;
  score: number;                     // 0-100 (higher = more saturated)
  factors: {
    creatorCount: number;
    videoVelocity: number;           // new videos in recent window
    concentration: number;           // engagement/sales among top creators
    trendAge: number;                // days since trend started
    contentToCommercialRatio: number;
  };
  explanation: string;
  calculatedAt: string;
}

export type TrendLifecycle =
  | 'emerging'
  | 'growing'
  | 'mature'
  | 'declining'
  | 'insufficient-data';

export interface TrendSignal {
  productId: string;
  window: '24h' | '3d' | '7d' | '30d';
  growthRate: number;                // percentage
  acceleration: number;              // change in growth rate
  lifecycle: TrendLifecycle;
  confidence: 'low' | 'medium' | 'high';
  calculatedAt: string;
}

// ============================================================
// User domain
// ============================================================

export type UserRole = 'owner' | 'admin' | 'analyst' | 'viewer';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface TikTokConnection {
  id: string;
  userId: string;
  marketplace: string;
  authorizedScopes: string[];
  lastSyncAt?: string;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
}

// ============================================================
// Watchlists and alerts
// ============================================================

export interface Watchlist {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  items: WatchlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  watchlistId: string;
  entityType: 'product' | 'creator' | 'shop' | 'video';
  entityId: string;
  notes?: string;
  tags: string[];
  createdAt: string;
}

export type AlertTriggerType =
  | 'score_threshold'
  | 'momentum'
  | 'commission_change'
  | 'price_change'
  | 'saturation'
  | 'new_content';

export interface AlertRule {
  id: string;
  workspaceId: string;
  name: string;
  triggerType: AlertTriggerType;
  conditions: Record<string, unknown>;
  cooldownMinutes: number;
  deliveryChannels: ('in_app' | 'email')[];
  active: boolean;
  lastTriggeredAt?: string;
  createdAt: string;
}

// ============================================================
// Subscription / billing
// ============================================================

export type PlanCode = 'free' | 'creator' | 'pro' | 'agency';

export interface Plan {
  code: PlanCode;
  name: string;
  priceMonthlyBrl: number;
  quotas: PlanQuotas;
}

export interface PlanQuotas {
  maxWatchlists: number;
  maxAlerts: number;
  maxSavedProducts: number;
  maxExportsPerMonth: number;
  maxAiAnalysesPerMonth: number;
  historyDays: number;
}

export const PLANS: Record<PlanCode, Plan> = {
  free: {
    code: 'free',
    name: 'Free',
    priceMonthlyBrl: 0,
    quotas: {
      maxWatchlists: 1,
      maxAlerts: 2,
      maxSavedProducts: 10,
      maxExportsPerMonth: 0,
      maxAiAnalysesPerMonth: 0,
      historyDays: 7,
    },
  },
  creator: {
    code: 'creator',
    name: 'Creator',
    priceMonthlyBrl: 49,
    quotas: {
      maxWatchlists: 5,
      maxAlerts: 10,
      maxSavedProducts: 100,
      maxExportsPerMonth: 5,
      maxAiAnalysesPerMonth: 20,
      historyDays: 30,
    },
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    priceMonthlyBrl: 119,
    quotas: {
      maxWatchlists: 20,
      maxAlerts: 50,
      maxSavedProducts: 500,
      maxExportsPerMonth: 25,
      maxAiAnalysesPerMonth: 100,
      historyDays: 90,
    },
  },
  agency: {
    code: 'agency',
    name: 'Agency',
    priceMonthlyBrl: 399,
    quotas: {
      maxWatchlists: 100,
      maxAlerts: 200,
      maxSavedProducts: 2000,
      maxExportsPerMonth: 100,
      maxAiAnalysesPerMonth: 500,
      historyDays: 180,
    },
  },
};

export * from "./scoring";

export * from "./creatorFit";
