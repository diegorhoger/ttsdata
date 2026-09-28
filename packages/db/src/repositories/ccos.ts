import { Pool, type PoolClient } from 'pg';
import {
  assertPartnershipTransition,
  assertProductTransition,
  assertContentTransition,
  type ContentStatus,
  type PartnershipStatus,
  type ProductStatus,
} from '../ccos/lifecycle';
import { getNextActionRule, type NextActionRuleResult } from '../ccos/next-actions';

export type PartnershipType = 'inbound_invite' | 'outbound_prospecting' | 'affiliate' | 'paid_campaign' | 'gifting';
export type CCOSPriority = 'low' | 'normal' | 'high' | 'urgent';
export type CCOSAdAuthorizationStatus = 'pending' | 'authorized' | 'unavailable';
export type CCOSNextActionStatus = 'open' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';
export type CCOSActionTarget =
  | { type: 'store'; id: string }
  | { type: 'partnership'; id: string }
  | { type: 'product'; id: string }
  | { type: 'content'; id: string }
  | { type: 'interaction'; id: string };

export interface CreateCCOSStoreInput {
  workspaceId: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
}

export interface UpdateCCOSStoreInput {
  name?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
}

export interface CreateCCOSPartnershipInput {
  workspaceId: string;
  storeId: string;
  type: PartnershipType;
  title?: string;
  terms?: string;
  priority?: CCOSPriority;
  lastContactAt?: Date;
}

export interface UpdateCCOSPartnershipInput {
  type?: PartnershipType;
  title?: string | null;
  terms?: string | null;
  priority?: CCOSPriority;
  lastContactAt?: Date | null;
  status?: PartnershipStatus;
}

export interface CreateCCOSProductInput {
  workspaceId: string;
  partnershipId: string;
  name: string;
  sku?: string;
  productUrl?: string;
  priceAmount?: string;
  currency?: string;
  commissionRate?: string;
  commissionAmount?: string;
  stockState?: string;
  trackingCode?: string;
  shippedAt?: Date;
  receivedAt?: Date;
  priority?: CCOSPriority;
  source?: string;
  provenance?: unknown;
}

export interface UpdateCCOSProductInput {
  name?: string;
  sku?: string | null;
  productUrl?: string | null;
  priceAmount?: string | null;
  currency?: string | null;
  commissionRate?: string | null;
  commissionAmount?: string | null;
  stockState?: string | null;
  trackingCode?: string | null;
  shippedAt?: Date | null;
  receivedAt?: Date | null;
  priority?: CCOSPriority;
  status?: ProductStatus;
  provenance?: unknown;
}

export interface CreateCCOSContentInput {
  workspaceId: string;
  productId: string;
  platform: string;
  format?: string;
  concept?: string;
}

export interface UpdateCCOSContentInput {
  status?: ContentStatus;
  platform?: string;
  format?: string | null;
  concept?: string | null;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  publicationUrl?: string | null;
  adAuthorizationStatus?: CCOSAdAuthorizationStatus | null;
  adAuthorizationCode?: string | null;
  adAuthorizationCreatedAt?: Date | null;
  adAuthorizationExpiresAt?: Date | null;
}

export interface CreateCCOSNextActionInput {
  workspaceId: string;
  target: CCOSActionTarget;
  title: string;
  priority?: CCOSPriority;
  dueAt?: Date;
  ownerUserId?: string;
  generatedAutomatically?: boolean;
  ruleKey?: string;
  waitingReason?: string;
}

export interface UpdateCCOSNextActionInput {
  status?: CCOSNextActionStatus;
  title?: string;
  priority?: CCOSPriority;
  dueAt?: Date | null;
  ownerUserId?: string | null;
  waitingReason?: string | null;
  resolutionReason?: string | null;
}

export interface CCOSStoreRecord {
  id: string;
  workspaceId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CCOSPartnershipRecord {
  id: string;
  workspaceId: string;
  storeId: string;
  type: PartnershipType;
  status: PartnershipStatus;
  title: string | null;
  terms: string | null;
  priority: CCOSPriority;
  lastContactAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CCOSProductRecord {
  id: string;
  workspaceId: string;
  partnershipId: string;
  name: string;
  sku: string | null;
  productUrl: string | null;
  priceAmount: string | null;
  currency: string | null;
  commissionRate: string | null;
  commissionAmount: string | null;
  stockState: string | null;
  status: ProductStatus;
  trackingCode: string | null;
  shippedAt: Date | null;
  receivedAt: Date | null;
  priority: CCOSPriority;
  source: string;
  provenance: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CCOSContentRecord {
  id: string;
  workspaceId: string;
  productId: string;
  status: ContentStatus;
  platform: string;
  format: string | null;
  concept: string | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  publicationUrl: string | null;
  adAuthorizationStatus: CCOSAdAuthorizationStatus | null;
  adAuthorizationCode: string | null;
  adAuthorizationCreatedAt: Date | null;
  adAuthorizationExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CCOSNextActionRecord {
  id: string;
  workspaceId: string;
  target: CCOSActionTarget;
  title: string;
  ruleKey: string | null;
  waitingReason: string | null;
  resolutionReason: string | null;
  status: CCOSNextActionStatus;
  priority: CCOSPriority;
  dueAt: Date | null;
  ownerUserId: string | null;
  generatedAutomatically: boolean;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

type StoreRow = {
  id: string; workspace_id: string; name: string; contact_name: string | null;
  contact_email: string | null; notes: string | null; created_at: Date; updated_at: Date;
};
type PartnershipRow = {
  id: string; workspace_id: string; store_id: string; type: PartnershipType;
  status: PartnershipStatus; title: string | null; terms: string | null; priority: CCOSPriority;
  last_contact_at: Date | null; created_at: Date; updated_at: Date;
};
type ProductRow = {
  id: string; workspace_id: string; partnership_id: string; name: string; sku: string | null;
  product_url: string | null; price_amount: string | null; currency: string | null;
  commission_rate: string | null; commission_amount: string | null; stock_state: string | null;
  status: ProductStatus; tracking_code: string | null; shipped_at: Date | null; received_at: Date | null;
  priority: CCOSPriority; source: string; provenance: unknown; created_at: Date; updated_at: Date;
};
type ContentRow = {
  id: string; workspace_id: string; product_id: string; status: ContentStatus; platform: string;
  format: string | null; concept: string | null; scheduled_at: Date | null;
  published_at: Date | null; publication_url: string | null;
  ad_authorization_status: CCOSAdAuthorizationStatus | null; ad_authorization_code: string | null;
  ad_authorization_created_at: Date | null; ad_authorization_expires_at: Date | null;
  created_at: Date; updated_at: Date;
};
type NextActionRow = {
  id: string; workspace_id: string; store_id: string | null; partnership_id: string | null;
  product_id: string | null; content_id: string | null; interaction_id: string | null;
  title: string; rule_key: string | null; dedupe_key: string | null; waiting_reason: string | null;
  resolution_reason: string | null; status: CCOSNextActionStatus;
  priority: CCOSPriority; due_at: Date | null; owner_user_id: string | null;
  generated_automatically: boolean; completed_at: Date | null; created_at: Date; updated_at: Date;
};

const STORE_COLUMNS = 'id, workspace_id, name, contact_name, contact_email, notes, created_at, updated_at';
const PARTNERSHIP_COLUMNS = `id, workspace_id, store_id, type, status, title, terms, priority,
  last_contact_at, created_at, updated_at`;
const PRODUCT_COLUMNS = `id, workspace_id, partnership_id, name, sku, product_url, price_amount, currency,
  commission_rate, commission_amount, stock_state, status, tracking_code, shipped_at, received_at,
  priority, source, provenance, created_at, updated_at`;
const CONTENT_COLUMNS = `id, workspace_id, product_id, status, platform, format, concept,
  scheduled_at, published_at, publication_url, ad_authorization_status, ad_authorization_code,
  ad_authorization_created_at, ad_authorization_expires_at, created_at, updated_at`;
const NEXT_ACTION_COLUMNS = `id, workspace_id, store_id, partnership_id, product_id, content_id,
  interaction_id, title, rule_key, dedupe_key, waiting_reason, resolution_reason, status, priority, due_at, owner_user_id,
  generated_automatically, completed_at, created_at, updated_at`;
const NEXT_ACTION_TRANSITIONS: Readonly<Record<CCOSNextActionStatus, readonly CCOSNextActionStatus[]>> = {
  open: ['in_progress', 'waiting', 'completed', 'cancelled'],
  in_progress: ['open', 'waiting', 'completed', 'cancelled'],
  waiting: ['open', 'in_progress', 'completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function mapStore(row: StoreRow): CCOSStoreRecord {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, contactName: row.contact_name,
    contactEmail: row.contact_email, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPartnership(row: PartnershipRow): CCOSPartnershipRecord {
  return { id: row.id, workspaceId: row.workspace_id, storeId: row.store_id, type: row.type,
    status: row.status, title: row.title, terms: row.terms, priority: row.priority,
    lastContactAt: row.last_contact_at, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapProduct(row: ProductRow): CCOSProductRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, partnershipId: row.partnership_id, name: row.name,
    sku: row.sku, productUrl: row.product_url, priceAmount: row.price_amount, currency: row.currency,
    commissionRate: row.commission_rate, commissionAmount: row.commission_amount, stockState: row.stock_state,
    status: row.status, trackingCode: row.tracking_code, shippedAt: row.shipped_at,
    receivedAt: row.received_at, priority: row.priority, source: row.source,
    provenance: row.provenance, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapContent(row: ContentRow): CCOSContentRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, productId: row.product_id, status: row.status,
    platform: row.platform, format: row.format, concept: row.concept, scheduledAt: row.scheduled_at,
    publishedAt: row.published_at, publicationUrl: row.publication_url,
    adAuthorizationStatus: row.ad_authorization_status, adAuthorizationCode: row.ad_authorization_code,
    adAuthorizationCreatedAt: row.ad_authorization_created_at,
    adAuthorizationExpiresAt: row.ad_authorization_expires_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapNextAction(row: NextActionRow): CCOSNextActionRecord {
  const candidates: CCOSActionTarget[] = [
    row.store_id ? { type: 'store', id: row.store_id } : null,
    row.partnership_id ? { type: 'partnership', id: row.partnership_id } : null,
    row.product_id ? { type: 'product', id: row.product_id } : null,
    row.content_id ? { type: 'content', id: row.content_id } : null,
    row.interaction_id ? { type: 'interaction', id: row.interaction_id } : null,
  ].filter((target): target is CCOSActionTarget => target !== null);
  if (candidates.length !== 1) throw new Error('CCOS next action must have exactly one target');
  return {
    id: row.id, workspaceId: row.workspace_id, target: candidates[0], title: row.title,
    ruleKey: row.rule_key, waitingReason: row.waiting_reason, resolutionReason: row.resolution_reason,
    status: row.status, priority: row.priority, dueAt: row.due_at,
    ownerUserId: row.owner_user_id, generatedAutomatically: row.generated_automatically,
    completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class CCOSRepository {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;

  constructor(poolOrDatabaseUrl: Pool | string) {
    if (typeof poolOrDatabaseUrl === 'string') {
      this.ownsPool = true;
      this.pool = new Pool({ connectionString: poolOrDatabaseUrl });
    } else {
      this.ownsPool = false;
      this.pool = poolOrDatabaseUrl;
    }
  }

  private targetColumns(target: CCOSActionTarget): [string | null, string | null, string | null, string | null, string | null] {
    return [
      target.type === 'store' ? target.id : null,
      target.type === 'partnership' ? target.id : null,
      target.type === 'product' ? target.id : null,
      target.type === 'content' ? target.id : null,
      target.type === 'interaction' ? target.id : null,
    ];
  }

  private async syncGeneratedAction(
    client: PoolClient,
    workspaceId: string,
    target: Extract<CCOSActionTarget, { type: 'partnership' | 'product' | 'content' }>,
    rule: NextActionRuleResult,
  ): Promise<void> {
    const targetColumn = `${target.type}_id`;
    const preserveAuthorizationRule = target.type === 'content'
      ? "AND rule_key NOT LIKE 'content.ad-auth.%'"
      : '';
    await client.query(
      `UPDATE ccos_next_actions
          SET status = 'cancelled', completed_at = NOW(), resolution_reason = $3, updated_at = NOW()
        WHERE workspace_id = $1 AND ${targetColumn} = $2 AND generated_automatically = true
          AND status IN ('open', 'in_progress', 'waiting') AND rule_key IS DISTINCT FROM $4
          ${preserveAuthorizationRule}`,
      [workspaceId, target.id, rule.kind === 'terminal' ? rule.reason : 'Superseded by lifecycle change', rule.ruleKey],
    );
    if (rule.kind === 'terminal') return;
    const dedupeKey = `${rule.ruleKey}:${target.type}:${target.id}`;
    const [storeId, partnershipId, productId, contentId, interactionId] = this.targetColumns(target);
    await client.query(
      `INSERT INTO ccos_next_actions
       (workspace_id, store_id, partnership_id, product_id, content_id, interaction_id, title, rule_key,
        dedupe_key, waiting_reason, status, priority, generated_automatically)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)
       ON CONFLICT (workspace_id, dedupe_key)
         WHERE generated_automatically = true AND status IN ('open', 'in_progress', 'waiting')
       DO UPDATE SET title = EXCLUDED.title, waiting_reason = EXCLUDED.waiting_reason,
         priority = EXCLUDED.priority, updated_at = NOW()`,
      [workspaceId, storeId, partnershipId, productId, contentId, interactionId, rule.title, rule.ruleKey,
        dedupeKey, rule.kind === 'waiting' ? rule.reason : null, rule.kind === 'waiting' ? 'waiting' : 'open', rule.priority],
    );
  }

  private async syncContentAuthorizationActions(
    client: PoolClient,
    workspaceId: string,
    content: Pick<CCOSContentRecord,
      'id' | 'adAuthorizationStatus' | 'adAuthorizationCode' | 'adAuthorizationExpiresAt'>,
    affectedRules: string[],
  ): Promise<void> {
    if (affectedRules.length === 0) return;
    await client.query(
      `UPDATE ccos_next_actions
          SET status = 'cancelled', completed_at = NOW(),
              resolution_reason = 'Ad authorization details changed', updated_at = NOW()
        WHERE workspace_id = $1 AND content_id = $2 AND generated_automatically = true
          AND rule_key = ANY($3::text[]) AND status IN ('open', 'in_progress', 'waiting')`,
      [workspaceId, content.id, affectedRules],
    );

    const actions: Array<{
      ruleKey: string; title: string; priority: CCOSPriority; dueAt: Date | null;
      status: CCOSNextActionStatus; waitingReason: string | null;
    }> = [];
    if (content.adAuthorizationStatus === 'pending') {
      actions.push({
        ruleKey: 'content.ad-auth.follow-up', title: 'Follow up on ad authorization', priority: 'normal',
        dueAt: null, status: 'waiting',
        waitingReason: 'Authorization is pending; follow up with the creator for an update.',
      });
    } else if (content.adAuthorizationStatus === 'authorized') {
      actions.push({
        ruleKey: 'content.ad-auth.share',
        title: content.adAuthorizationCode ? 'Share ad authorization code' : 'Record and share ad authorization code',
        priority: 'high', dueAt: null, status: 'open', waitingReason: null,
      });
      if (content.adAuthorizationExpiresAt) {
        actions.push({
          ruleKey: 'content.ad-auth.expiry', title: 'Review ad authorization expiry', priority: 'high',
          dueAt: content.adAuthorizationExpiresAt, status: 'open', waitingReason: null,
        });
      }
    }
    for (const action of actions.filter((candidate) => affectedRules.includes(candidate.ruleKey))) {
      await client.query(
        `INSERT INTO ccos_next_actions
         (workspace_id, content_id, title, rule_key, dedupe_key, waiting_reason, status, priority, due_at,
          generated_automatically)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         ON CONFLICT (workspace_id, dedupe_key)
           WHERE generated_automatically = true AND status IN ('open', 'in_progress', 'waiting')
         DO UPDATE SET title = EXCLUDED.title, waiting_reason = EXCLUDED.waiting_reason,
           status = EXCLUDED.status, priority = EXCLUDED.priority, due_at = EXCLUDED.due_at,
           updated_at = NOW()`,
        [workspaceId, content.id, action.title, action.ruleKey,
          `${action.ruleKey}:content:${content.id}`, action.waitingReason, action.status, action.priority,
          action.dueAt],
      );
    }
  }

  async createNextAction(input: CreateCCOSNextActionInput): Promise<CCOSNextActionRecord> {
    const generated = input.generatedAutomatically ?? false;
    if (generated && !input.ruleKey) throw new Error('Generated CCOS next actions require ruleKey');
    const [storeId, partnershipId, productId, contentId, interactionId] = this.targetColumns(input.target);
    const dedupeKey = generated ? `${input.ruleKey}:${input.target.type}:${input.target.id}` : null;
    const result = await this.pool.query<NextActionRow>(
      `INSERT INTO ccos_next_actions
       (workspace_id, store_id, partnership_id, product_id, content_id, interaction_id, title, rule_key,
        dedupe_key, waiting_reason, priority, due_at, owner_user_id, generated_automatically)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (workspace_id, dedupe_key)
         WHERE generated_automatically = true AND status IN ('open', 'in_progress', 'waiting')
       DO UPDATE SET updated_at = ccos_next_actions.updated_at
       RETURNING ${NEXT_ACTION_COLUMNS}`,
      [input.workspaceId, storeId, partnershipId, productId, contentId, interactionId, input.title,
        input.ruleKey ?? null, dedupeKey, input.waitingReason ?? null, input.priority ?? 'normal',
        input.dueAt ?? null, input.ownerUserId ?? null, generated],
    );
    if (result.rowCount !== 1) throw new Error('CCOS next action insert did not return exactly one row');
    return mapNextAction(result.rows[0]);
  }

  async getNextAction(workspaceId: string, actionId: string): Promise<CCOSNextActionRecord | null> {
    const result = await this.pool.query<NextActionRow>(
      `SELECT ${NEXT_ACTION_COLUMNS} FROM ccos_next_actions WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, actionId],
    );
    return result.rows[0] ? mapNextAction(result.rows[0]) : null;
  }

  async listAttentionInbox(workspaceId: string): Promise<CCOSNextActionRecord[]> {
    const result = await this.pool.query<NextActionRow>(
      `SELECT ${NEXT_ACTION_COLUMNS} FROM ccos_next_actions
        WHERE workspace_id = $1 AND status IN ('open', 'in_progress', 'waiting')
        ORDER BY CASE WHEN status = 'waiting' THEN 1 ELSE 0 END,
          CASE WHEN due_at < NOW() THEN 0 ELSE 1 END,
          CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
          due_at ASC NULLS LAST, created_at ASC, id ASC`,
      [workspaceId],
    );
    return result.rows.map(mapNextAction);
  }

  async updateNextAction(
    workspaceId: string, actionId: string, input: UpdateCCOSNextActionInput,
  ): Promise<CCOSNextActionRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<NextActionRow>(
        `SELECT ${NEXT_ACTION_COLUMNS} FROM ccos_next_actions
          WHERE workspace_id = $1 AND id = $2 FOR UPDATE`, [workspaceId, actionId],
      );
      const current = selected.rows[0] ? mapNextAction(selected.rows[0]) : null;
      if (!current) { await client.query('ROLLBACK'); return null; }
      const manuallyCompletableAuthorizationAction = current.generatedAutomatically
        && current.ruleKey?.startsWith('content.ad-auth.')
        && input.status === 'completed'
        && Boolean(input.resolutionReason);
      if (current.generatedAutomatically && input.status !== undefined
        && ['completed', 'cancelled'].includes(input.status)
        && !manuallyCompletableAuthorizationAction) {
        throw new Error('Generated CCOS next actions are resolved only by a target lifecycle transition');
      }
      if (input.status !== undefined && input.status !== current.status
        && !NEXT_ACTION_TRANSITIONS[current.status].includes(input.status)) {
        throw new Error(`Invalid CCOS next action transition: ${current.status} -> ${input.status}`);
      }
      const updates: string[] = [];
      const values: unknown[] = [workspaceId, actionId];
      const add = (column: string, value: unknown) => { values.push(value); updates.push(`${column} = $${values.length}`); };
      if (input.status !== undefined) {
        add('status', input.status);
        add('completed_at', ['completed', 'cancelled'].includes(input.status) ? new Date() : null);
      }
      if (input.title !== undefined) add('title', input.title);
      if (input.priority !== undefined) add('priority', input.priority);
      if (input.dueAt !== undefined) add('due_at', input.dueAt);
      if (input.ownerUserId !== undefined) add('owner_user_id', input.ownerUserId);
      if (input.waitingReason !== undefined) add('waiting_reason', input.waitingReason);
      if (input.resolutionReason !== undefined) add('resolution_reason', input.resolutionReason);
      if (updates.length === 0) { await client.query('COMMIT'); return current; }
      const result = await client.query<NextActionRow>(
        `UPDATE ccos_next_actions SET ${updates.join(', ')}, updated_at = NOW()
          WHERE workspace_id = $1 AND id = $2 RETURNING ${NEXT_ACTION_COLUMNS}`, values,
      );
      await client.query('COMMIT');
      return result.rows[0] ? mapNextAction(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async createStore(input: CreateCCOSStoreInput): Promise<CCOSStoreRecord> {
    const result = await this.pool.query<StoreRow>(
      `INSERT INTO ccos_stores (workspace_id, name, contact_name, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${STORE_COLUMNS}`,
      [input.workspaceId, input.name, input.contactName ?? null, input.contactEmail ?? null, input.notes ?? null],
    );
    if (result.rowCount !== 1) throw new Error('CCOS store insert did not return exactly one row');
    return mapStore(result.rows[0]);
  }

  async listStores(workspaceId: string): Promise<CCOSStoreRecord[]> {
    const result = await this.pool.query<StoreRow>(
      `SELECT ${STORE_COLUMNS} FROM ccos_stores WHERE workspace_id = $1 ORDER BY name, created_at`, [workspaceId],
    );
    return result.rows.map(mapStore);
  }

  async getStore(workspaceId: string, storeId: string): Promise<CCOSStoreRecord | null> {
    const result = await this.pool.query<StoreRow>(
      `SELECT ${STORE_COLUMNS} FROM ccos_stores WHERE workspace_id = $1 AND id = $2`, [workspaceId, storeId],
    );
    return result.rows[0] ? mapStore(result.rows[0]) : null;
  }

  async updateStore(workspaceId: string, storeId: string, input: UpdateCCOSStoreInput): Promise<CCOSStoreRecord | null> {
    const updates: string[] = [];
    const values: unknown[] = [workspaceId, storeId];
    const add = (column: string, value: unknown) => { values.push(value); updates.push(`${column} = $${values.length}`); };
    if (input.name !== undefined) add('name', input.name);
    if (input.contactName !== undefined) add('contact_name', input.contactName);
    if (input.contactEmail !== undefined) add('contact_email', input.contactEmail);
    if (input.notes !== undefined) add('notes', input.notes);
    if (updates.length === 0) return this.getStore(workspaceId, storeId);
    const result = await this.pool.query<StoreRow>(
      `UPDATE ccos_stores SET ${updates.join(', ')}, updated_at = NOW()
       WHERE workspace_id = $1 AND id = $2 RETURNING ${STORE_COLUMNS}`, values,
    );
    return result.rows[0] ? mapStore(result.rows[0]) : null;
  }

  async createPartnership(input: CreateCCOSPartnershipInput): Promise<CCOSPartnershipRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<PartnershipRow>(
        `INSERT INTO ccos_partnerships (workspace_id, store_id, type, title, terms, priority, last_contact_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PARTNERSHIP_COLUMNS}`,
        [input.workspaceId, input.storeId, input.type, input.title ?? null, input.terms ?? null,
          input.priority ?? 'normal', input.lastContactAt ?? null],
      );
      if (result.rowCount !== 1) throw new Error('CCOS partnership insert did not return exactly one row');
      const record = mapPartnership(result.rows[0]);
      await this.syncGeneratedAction(client, input.workspaceId, { type: 'partnership', id: record.id },
        getNextActionRule({ type: 'partnership', status: record.status }));
      await client.query('COMMIT');
      return record;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listPartnerships(workspaceId: string, storeId?: string): Promise<CCOSPartnershipRecord[]> {
    const values: unknown[] = [workspaceId];
    const storePredicate = storeId === undefined ? '' : ' AND store_id = $2';
    if (storeId !== undefined) values.push(storeId);
    const result = await this.pool.query<PartnershipRow>(
      `SELECT ${PARTNERSHIP_COLUMNS} FROM ccos_partnerships WHERE workspace_id = $1${storePredicate}
       ORDER BY updated_at DESC, created_at DESC`, values,
    );
    return result.rows.map(mapPartnership);
  }

  async getPartnership(workspaceId: string, partnershipId: string): Promise<CCOSPartnershipRecord | null> {
    const result = await this.pool.query<PartnershipRow>(
      `SELECT ${PARTNERSHIP_COLUMNS} FROM ccos_partnerships WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, partnershipId],
    );
    return result.rows[0] ? mapPartnership(result.rows[0]) : null;
  }

  async updatePartnership(
    workspaceId: string, partnershipId: string, input: UpdateCCOSPartnershipInput,
  ): Promise<CCOSPartnershipRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<PartnershipRow>(
        `SELECT ${PARTNERSHIP_COLUMNS} FROM ccos_partnerships
         WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
        [workspaceId, partnershipId],
      );
      const current = selected.rows[0] ? mapPartnership(selected.rows[0]) : null;
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      if (input.status !== undefined && input.status !== current.status) {
        assertPartnershipTransition(current.status, input.status);
      }

      const updates: string[] = [];
      const values: unknown[] = [workspaceId, partnershipId];
      const add = (column: string, value: unknown) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };
      if (input.type !== undefined) add('type', input.type);
      if (input.status !== undefined) add('status', input.status);
      if (input.title !== undefined) add('title', input.title);
      if (input.terms !== undefined) add('terms', input.terms);
      if (input.priority !== undefined) add('priority', input.priority);
      if (input.lastContactAt !== undefined) add('last_contact_at', input.lastContactAt);
      if (updates.length === 0) {
        await client.query('COMMIT');
        return current;
      }
      const result = await client.query<PartnershipRow>(
        `UPDATE ccos_partnerships SET ${updates.join(', ')}, updated_at = NOW()
         WHERE workspace_id = $1 AND id = $2 RETURNING ${PARTNERSHIP_COLUMNS}`,
        values,
      );
      if (input.status !== undefined && input.status !== current.status) {
        await this.syncGeneratedAction(client, workspaceId, { type: 'partnership', id: partnershipId },
          getNextActionRule({ type: 'partnership', status: input.status }));
      }
      await client.query('COMMIT');
      return result.rows[0] ? mapPartnership(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createProduct(input: CreateCCOSProductInput): Promise<CCOSProductRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ProductRow>(
        `INSERT INTO ccos_products
         (workspace_id, partnership_id, name, sku, product_url, price_amount, currency, commission_rate,
          commission_amount, stock_state, tracking_code, shipped_at, received_at, priority, source, provenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${PRODUCT_COLUMNS}`,
        [input.workspaceId, input.partnershipId, input.name, input.sku ?? null, input.productUrl ?? null,
          input.priceAmount ?? null, input.currency ?? null, input.commissionRate ?? null,
          input.commissionAmount ?? null, input.stockState ?? null, input.trackingCode ?? null,
          input.shippedAt ?? null, input.receivedAt ?? null, input.priority ?? 'normal',
          input.source ?? 'manual', input.provenance ?? null],
      );
      if (result.rowCount !== 1) throw new Error('CCOS product insert did not return exactly one row');
      const record = mapProduct(result.rows[0]);
      await this.syncGeneratedAction(client, input.workspaceId, { type: 'product', id: record.id },
        getNextActionRule({ type: 'product', status: record.status }));
      await client.query('COMMIT');
      return record;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listProducts(workspaceId: string, partnershipId?: string): Promise<CCOSProductRecord[]> {
    const values: unknown[] = [workspaceId];
    const partnershipPredicate = partnershipId === undefined ? '' : ' AND partnership_id = $2';
    if (partnershipId !== undefined) values.push(partnershipId);
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM ccos_products WHERE workspace_id = $1${partnershipPredicate}
       ORDER BY updated_at DESC, created_at DESC`, values,
    );
    return result.rows.map(mapProduct);
  }

  async getProduct(workspaceId: string, productId: string): Promise<CCOSProductRecord | null> {
    const result = await this.pool.query<ProductRow>(
      `SELECT ${PRODUCT_COLUMNS} FROM ccos_products WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, productId],
    );
    return result.rows[0] ? mapProduct(result.rows[0]) : null;
  }

  async updateProduct(
    workspaceId: string, productId: string, input: UpdateCCOSProductInput,
  ): Promise<CCOSProductRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<ProductRow>(
        `SELECT ${PRODUCT_COLUMNS} FROM ccos_products
         WHERE workspace_id = $1 AND id = $2 FOR UPDATE`, [workspaceId, productId],
      );
      const current = selected.rows[0] ? mapProduct(selected.rows[0]) : null;
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      const statusChanged = input.status !== undefined && input.status !== current.status;
      if (statusChanged) assertProductTransition(current.status, input.status!);

      const updates: string[] = [];
      const values: unknown[] = [workspaceId, productId];
      const add = (column: string, value: unknown) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };
      if (input.name !== undefined) add('name', input.name);
      if (input.sku !== undefined) add('sku', input.sku);
      if (input.productUrl !== undefined) add('product_url', input.productUrl);
      if (input.priceAmount !== undefined) add('price_amount', input.priceAmount);
      if (input.currency !== undefined) add('currency', input.currency);
      if (input.commissionRate !== undefined) add('commission_rate', input.commissionRate);
      if (input.commissionAmount !== undefined) add('commission_amount', input.commissionAmount);
      if (input.stockState !== undefined) add('stock_state', input.stockState);
      if (input.status !== undefined) add('status', input.status);
      if (input.trackingCode !== undefined) add('tracking_code', input.trackingCode);
      if (input.shippedAt !== undefined) add('shipped_at', input.shippedAt);
      if (input.receivedAt !== undefined) add('received_at', input.receivedAt);
      if (input.priority !== undefined) add('priority', input.priority);
      if (input.provenance !== undefined) add('provenance', input.provenance);
      if (updates.length === 0) {
        await client.query('COMMIT');
        return current;
      }
      const result = await client.query<ProductRow>(
        `UPDATE ccos_products SET ${updates.join(', ')}, updated_at = NOW()
         WHERE workspace_id = $1 AND id = $2 RETURNING ${PRODUCT_COLUMNS}`, values,
      );
      if (statusChanged) {
        await client.query(
          `INSERT INTO ccos_interactions
           (workspace_id, partnership_id, direction, channel, summary, occurred_at, source)
           VALUES ($1, $2, 'system', 'product_lifecycle', $3, NOW(), 'system')`,
          [
            workspaceId,
            current.partnershipId,
            `Product ${current.id} lifecycle changed: ${current.status} -> ${input.status}`,
          ],
        );
        await this.syncGeneratedAction(client, workspaceId, { type: 'product', id: productId },
          getNextActionRule({ type: 'product', status: input.status! }));
      }
      await client.query('COMMIT');
      return result.rows[0] ? mapProduct(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createContent(input: CreateCCOSContentInput): Promise<CCOSContentRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<ContentRow>(
        `INSERT INTO ccos_contents (workspace_id, product_id, platform, format, concept)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${CONTENT_COLUMNS}`,
        [input.workspaceId, input.productId, input.platform, input.format ?? null, input.concept ?? null],
      );
      if (result.rowCount !== 1) throw new Error('CCOS content insert did not return exactly one row');
      const record = mapContent(result.rows[0]);
      await this.syncGeneratedAction(client, input.workspaceId, { type: 'content', id: record.id },
        getNextActionRule({ type: 'content', status: record.status }));
      await client.query('COMMIT');
      return record;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listContents(workspaceId: string, productId?: string): Promise<CCOSContentRecord[]> {
    const values: unknown[] = [workspaceId];
    const productPredicate = productId === undefined ? '' : ' AND product_id = $2';
    if (productId !== undefined) values.push(productId);
    const result = await this.pool.query<ContentRow>(
      `SELECT ${CONTENT_COLUMNS} FROM ccos_contents WHERE workspace_id = $1${productPredicate}
       ORDER BY updated_at DESC, created_at DESC`, values,
    );
    return result.rows.map(mapContent);
  }

  async getContent(workspaceId: string, contentId: string): Promise<CCOSContentRecord | null> {
    const result = await this.pool.query<ContentRow>(
      `SELECT ${CONTENT_COLUMNS} FROM ccos_contents WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, contentId],
    );
    return result.rows[0] ? mapContent(result.rows[0]) : null;
  }

  async updateContent(
    workspaceId: string, contentId: string, input: UpdateCCOSContentInput,
  ): Promise<CCOSContentRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<ContentRow & { partnership_id: string }>(
        `SELECT c.id, c.workspace_id, c.product_id, c.status, c.platform, c.format, c.concept,
                c.scheduled_at, c.published_at, c.publication_url, c.ad_authorization_status,
                c.ad_authorization_code, c.ad_authorization_created_at, c.ad_authorization_expires_at,
                c.created_at, c.updated_at,
                p.partnership_id
           FROM ccos_contents c
           JOIN ccos_products p ON p.workspace_id = c.workspace_id AND p.id = c.product_id
          WHERE c.workspace_id = $1 AND c.id = $2 FOR UPDATE OF c`,
        [workspaceId, contentId],
      );
      const current = selected.rows[0] ? mapContent(selected.rows[0]) : null;
      if (!current) {
        await client.query('ROLLBACK');
        return null;
      }
      const statusChanged = input.status !== undefined && input.status !== current.status;
      if (statusChanged) assertContentTransition(current.status, input.status!);
      const effectiveStatus = input.status ?? current.status;
      const effectiveScheduledAt = input.scheduledAt !== undefined ? input.scheduledAt : current.scheduledAt;
      const effectivePublishedAt = input.publishedAt !== undefined ? input.publishedAt : current.publishedAt;
      const effectivePublicationUrl = input.publicationUrl !== undefined
        ? input.publicationUrl
        : current.publicationUrl;
      if (effectiveStatus === 'scheduled' && !effectiveScheduledAt) {
        throw new Error('Invalid CCOS content scheduling: scheduledAt is required');
      }
      if (['published', 'ads_authorized', 'monitoring'].includes(effectiveStatus)
        && (!effectivePublishedAt || !effectivePublicationUrl)) {
        throw new Error('Invalid CCOS content publication: publishedAt and publicationUrl are required');
      }
      const effectiveAdAuthorizationCreatedAt = input.adAuthorizationCreatedAt !== undefined
        ? input.adAuthorizationCreatedAt : current.adAuthorizationCreatedAt;
      const effectiveAdAuthorizationExpiresAt = input.adAuthorizationExpiresAt !== undefined
        ? input.adAuthorizationExpiresAt : current.adAuthorizationExpiresAt;
      const effectiveAdAuthorizationStatus = input.adAuthorizationStatus !== undefined
        ? input.adAuthorizationStatus : current.adAuthorizationStatus;
      const effectiveAdAuthorizationCode = input.adAuthorizationCode !== undefined
        ? input.adAuthorizationCode : current.adAuthorizationCode;
      if (effectiveAdAuthorizationStatus === 'authorized'
        && (!effectiveAdAuthorizationCode || !effectiveAdAuthorizationCreatedAt)) {
        throw new Error('Invalid CCOS content ad authorization: authorized status requires code and creation time');
      }
      if (effectiveAdAuthorizationStatus !== 'authorized'
        && (effectiveAdAuthorizationCode || effectiveAdAuthorizationCreatedAt || effectiveAdAuthorizationExpiresAt)) {
        throw new Error('Invalid CCOS content ad authorization: pending, unavailable, or unset status cannot retain authorization details');
      }
      if (effectiveStatus === 'ads_authorized' && effectiveAdAuthorizationStatus !== 'authorized') {
        throw new Error('Invalid CCOS content ad authorization: ads_authorized status requires authorized details');
      }
      if (effectiveAdAuthorizationCreatedAt && effectiveAdAuthorizationExpiresAt
        && effectiveAdAuthorizationExpiresAt < effectiveAdAuthorizationCreatedAt) {
        throw new Error('Invalid CCOS content ad authorization: expiry must be after creation');
      }
      const metadataChanged = input.scheduledAt !== undefined
        || input.publishedAt !== undefined
        || input.publicationUrl !== undefined;

      const updates: string[] = [];
      const values: unknown[] = [workspaceId, contentId];
      const add = (column: string, value: unknown) => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };
      if (input.status !== undefined) add('status', input.status);
      if (input.platform !== undefined) add('platform', input.platform);
      if (input.format !== undefined) add('format', input.format);
      if (input.concept !== undefined) add('concept', input.concept);
      if (input.scheduledAt !== undefined) add('scheduled_at', input.scheduledAt);
      if (input.publishedAt !== undefined) add('published_at', input.publishedAt);
      if (input.publicationUrl !== undefined) add('publication_url', input.publicationUrl);
      if (input.adAuthorizationStatus !== undefined) add('ad_authorization_status', input.adAuthorizationStatus);
      if (input.adAuthorizationCode !== undefined) add('ad_authorization_code', input.adAuthorizationCode);
      if (input.adAuthorizationCreatedAt !== undefined) add('ad_authorization_created_at', input.adAuthorizationCreatedAt);
      if (input.adAuthorizationExpiresAt !== undefined) add('ad_authorization_expires_at', input.adAuthorizationExpiresAt);
      if (updates.length === 0) {
        await client.query('COMMIT');
        return current;
      }
      const result = await client.query<ContentRow>(
        `UPDATE ccos_contents SET ${updates.join(', ')}, updated_at = NOW()
         WHERE workspace_id = $1 AND id = $2 RETURNING ${CONTENT_COLUMNS}`, values,
      );
      const sameDate = (left: Date | null, right: Date | null) => left?.getTime() === right?.getTime();
      const authorizationStatusChanged = input.adAuthorizationStatus !== undefined
        && input.adAuthorizationStatus !== current.adAuthorizationStatus;
      const authorizationCodeChanged = input.adAuthorizationCode !== undefined
        && input.adAuthorizationCode !== current.adAuthorizationCode;
      const authorizationCreatedAtChanged = input.adAuthorizationCreatedAt !== undefined
        && !sameDate(input.adAuthorizationCreatedAt, current.adAuthorizationCreatedAt);
      const authorizationExpiresAtChanged = input.adAuthorizationExpiresAt !== undefined
        && !sameDate(input.adAuthorizationExpiresAt, current.adAuthorizationExpiresAt);
      const authorizationChanged = authorizationStatusChanged || authorizationCodeChanged
        || authorizationCreatedAtChanged || authorizationExpiresAtChanged;
      if (statusChanged || metadataChanged || authorizationChanged) {
        const summaryParts: string[] = [];
        if (statusChanged) summaryParts.push(`Content ${current.id} lifecycle changed: ${current.status} -> ${input.status}`);
        else summaryParts.push(`Content ${current.id}`);
        if (metadataChanged) summaryParts.push('publication metadata updated');
        if (authorizationChanged) summaryParts.push('ad authorization details updated');
        const summary = summaryParts.join('; ');
        await client.query(
          `INSERT INTO ccos_interactions
           (workspace_id, partnership_id, direction, channel, summary, occurred_at, source)
           VALUES ($1, $2, 'system', 'content_lifecycle', $3, NOW(), 'system')`,
          [workspaceId, selected.rows[0].partnership_id, summary],
        );
      }
      if (statusChanged) {
        await this.syncGeneratedAction(client, workspaceId, { type: 'content', id: contentId },
          getNextActionRule({ type: 'content', status: input.status! }));
      }
      if (authorizationChanged) {
        const affectedRules = authorizationStatusChanged
          ? ['content.ad-auth.follow-up', 'content.ad-auth.share', 'content.ad-auth.expiry']
          : [
              ...(authorizationCodeChanged ? ['content.ad-auth.share'] : []),
              ...(authorizationExpiresAtChanged ? ['content.ad-auth.expiry'] : []),
            ];
        await this.syncContentAuthorizationActions(client, workspaceId, mapContent(result.rows[0]), affectedRules);
      }
      await client.query('COMMIT');
      return result.rows[0] ? mapContent(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }


  // Interaction methods
  async createInteraction(input: CreateCCOSInteractionInput): Promise<CCOSInteractionRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the partnership while checking polymorphic sources: all linked entities must
      // belong to this same timeline, not merely to the same tenant.
      const partnership = await client.query(
        'SELECT id FROM ccos_partnerships WHERE workspace_id = $1 AND id = $2 FOR SHARE',
        [input.workspaceId, input.partnershipId],
      );
      if (partnership.rowCount !== 1) throw new Error('CCOS partnership not found in workspace');
      for (const link of input.sourceLinks ?? []) {
        const sourceQuery: Record<CCOSInteractionSourceType, string> = {
          partnership: `SELECT id FROM ccos_partnerships WHERE workspace_id = $1 AND id = $2 AND id = $3 FOR SHARE`,
          product: `SELECT id FROM ccos_products WHERE workspace_id = $1 AND id = $2 AND partnership_id = $3 FOR SHARE`,
          content: `SELECT c.id FROM ccos_contents c JOIN ccos_products p ON p.workspace_id = c.workspace_id AND p.id = c.product_id
                    WHERE c.workspace_id = $1 AND c.id = $2 AND p.partnership_id = $3 FOR SHARE OF c, p`,
          action: `SELECT a.id FROM ccos_next_actions a
                   LEFT JOIN ccos_products p ON p.workspace_id = a.workspace_id AND p.id = a.product_id
                   LEFT JOIN ccos_contents c ON c.workspace_id = a.workspace_id AND c.id = a.content_id
                   LEFT JOIN ccos_products cp ON cp.workspace_id = c.workspace_id AND cp.id = c.product_id
                   LEFT JOIN ccos_partnerships ps ON ps.workspace_id = a.workspace_id AND ps.id = $3
                   LEFT JOIN ccos_interactions i ON i.workspace_id = a.workspace_id AND i.id = a.interaction_id
                   WHERE a.workspace_id = $1 AND a.id = $2 AND ps.id IS NOT NULL AND
                   (a.partnership_id = $3 OR p.partnership_id = $3 OR cp.partnership_id = $3
                    OR i.partnership_id = $3 OR a.store_id = ps.store_id) FOR SHARE OF a`,
          template_version: `SELECT id FROM ccos_template_versions WHERE workspace_id = $1 AND id = $2 FOR SHARE`,
        };
        if (!Object.hasOwn(sourceQuery, link.sourceType)) throw new Error('Invalid CCOS interaction source type');
        const sourceParams = link.sourceType === 'template_version'
          ? [input.workspaceId, link.sourceId]
          : [input.workspaceId, link.sourceId, input.partnershipId];
        const source = await client.query(sourceQuery[link.sourceType], sourceParams);
        if (source.rowCount !== 1) throw new Error('CCOS interaction source not found in partnership/workspace');
      }
      const occurredAt = input.occurredAt ?? new Date();
      const result = await client.query<InteractionRow>(
        `INSERT INTO ccos_interactions (workspace_id, partnership_id, direction, channel, summary, occurred_at, source, template_version_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${INTERACTION_COLUMNS}`,
        [input.workspaceId, input.partnershipId, input.direction, input.channel, input.summary,
         occurredAt, input.source ?? 'manual', input.templateVersionId ?? null],
      );
      if (result.rowCount !== 1) throw new Error('CCOS interaction insert did not return exactly one row');
      const interaction = mapInteraction(result.rows[0]);

      // Record template usage if template version provided
      if (input.templateVersionId) {
        await client.query(
          `INSERT INTO ccos_template_usage (workspace_id, template_version_id, interaction_id)
           VALUES ($1, $2, $3)`,
          [input.workspaceId, input.templateVersionId, interaction.id],
        );
      }

      // Record source links
      if (input.sourceLinks && input.sourceLinks.length > 0) {
        for (const link of input.sourceLinks) {
          await client.query(
            `INSERT INTO ccos_interaction_sources (workspace_id, interaction_id, source_type, source_id)
             VALUES ($1, $2, $3, $4)`,
            [input.workspaceId, interaction.id, link.sourceType, link.sourceId],
          );
        }
      }

      await client.query('COMMIT');
      return interaction;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async listInteractions(workspaceId: string, partnershipId: string): Promise<CCOSInteractionRecord[]> {
    const result = await this.pool.query<InteractionRow>(
      `SELECT ${INTERACTION_COLUMNS} FROM ccos_interactions
       WHERE workspace_id = $1 AND partnership_id = $2
       ORDER BY occurred_at DESC, created_at DESC`,
      [workspaceId, partnershipId],
    );
    return result.rows.map(mapInteraction);
  }

  async listTimeline(workspaceId: string, partnershipId: string): Promise<Array<CCOSInteractionRecord & { sources: CCOInteractionSourceRecord[] }>> {
    const interactions = await this.listInteractions(workspaceId, partnershipId);
    const interactionIds = interactions.map(i => i.id);
    if (interactionIds.length === 0) return [];

    const placeholders = interactionIds.map((_, i) => `$${i + 2}`).join(',');
    const sourcesResult = await this.pool.query<InteractionSourceRow>(
      `SELECT id, workspace_id, interaction_id, source_type, source_id, created_at
       FROM ccos_interaction_sources WHERE workspace_id = $1 AND interaction_id IN (${placeholders})`,
      [workspaceId, ...interactionIds],
    );

    const sourcesByInteraction = new Map<string, CCOInteractionSourceRecord[]>();
    for (const row of sourcesResult.rows) {
      const arr = sourcesByInteraction.get(row.interaction_id) ?? [];
      arr.push(mapInteractionSource(row));
      sourcesByInteraction.set(row.interaction_id, arr);
    }

    return interactions.map(interaction => ({
      ...interaction,
      sources: sourcesByInteraction.get(interaction.id) ?? [],
    }));
  }

  async getInteractionSources(workspaceId: string, interactionId: string): Promise<CCOInteractionSourceRecord[]> {
    const result = await this.pool.query<InteractionSourceRow>(
      `SELECT id, workspace_id, interaction_id, source_type, source_id, created_at
       FROM ccos_interaction_sources WHERE workspace_id = $1 AND interaction_id = $2`,
      [workspaceId, interactionId],
    );
    return result.rows.map(mapInteractionSource);
  }

  // Template Version methods
  async createTemplateVersion(input: CreateCCOSTemplateVersionInput): Promise<CCOSTemplateVersionRecord> {
    assertTemplateDefinition(input.subject, input.body, input.variables ?? []);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize allocation even when there is no prior version to row-lock.
      const workspace = await client.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [input.workspaceId]);
      if (workspace.rowCount !== 1) throw new Error('CCOS workspace not found');
      const versionResult = await client.query<{ max_version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS max_version FROM ccos_template_versions WHERE workspace_id = $1 AND type = $2`,
        [input.workspaceId, input.type],
      );
      const nextVersion = versionResult.rows[0].max_version;
      const result = await client.query<TemplateVersionRow>(
        `INSERT INTO ccos_template_versions (workspace_id, type, version, subject, body, variables)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${TEMPLATE_VERSION_COLUMNS}`,
        [input.workspaceId, input.type, nextVersion, input.subject, input.body, JSON.stringify(input.variables ?? [])],
      );
      if (result.rowCount !== 1) throw new Error('CCOS template version insert did not return exactly one row');
      await client.query('COMMIT');
      return mapTemplateVersion(result.rows[0]);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async getTemplateVersion(workspaceId: string, templateVersionId: string): Promise<CCOSTemplateVersionRecord | null> {
    const result = await this.pool.query<TemplateVersionRow>(
      `SELECT ${TEMPLATE_VERSION_COLUMNS} FROM ccos_template_versions WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, templateVersionId],
    );
    return result.rows[0] ? mapTemplateVersion(result.rows[0]) : null;
  }

  async listTemplateVersions(workspaceId: string, type?: CCOSTemplateType): Promise<CCOSTemplateVersionRecord[]> {
    const values: unknown[] = [workspaceId];
    const typePredicate = type === undefined ? '' : ' AND type = $2';
    if (type !== undefined) values.push(type);
    const result = await this.pool.query<TemplateVersionRow>(
      `SELECT ${TEMPLATE_VERSION_COLUMNS} FROM ccos_template_versions WHERE workspace_id = $1${typePredicate}
       ORDER BY type, version DESC, created_at DESC`, values,
    );
    return result.rows.map(mapTemplateVersion);
  }

  async getLatestTemplateVersion(workspaceId: string, type: CCOSTemplateType): Promise<CCOSTemplateVersionRecord | null> {
    const result = await this.pool.query<TemplateVersionRow>(
      `SELECT ${TEMPLATE_VERSION_COLUMNS} FROM ccos_template_versions WHERE workspace_id = $1 AND type = $2
       ORDER BY version DESC LIMIT 1`, [workspaceId, type],
    );
    return result.rows[0] ? mapTemplateVersion(result.rows[0]) : null;
  }

  renderTemplate(template: CCOSTemplateVersionRecord, context: Record<string, string>): { subject: string; body: string } {
    assertTemplateDefinition(template.subject, template.body, template.variables);
    const expected = new Set(template.variables);
    const received = new Set(Object.keys(context));
    const missing = [...expected].filter((key) => !received.has(key));
    const extra = [...received].filter((key) => !expected.has(key));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(`Invalid CCOS template render: context mismatch (missing: ${missing.join(',')}; extra: ${extra.join(',')})`);
    }
    const replaceVars = (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => context[key]);
    };
    const rendered = {
      subject: replaceVars(template.subject),
      body: replaceVars(template.body),
    };
    if (/\{\{\w+\}\}/.test(rendered.subject) || /\{\{\w+\}\}/.test(rendered.body)) {
      throw new Error('Invalid CCOS template render: unresolved placeholder');
    }
    return rendered;
  }


  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }
}

export type CCOSTemplateType =
  | 'invite_first_contact'
  | 'partnership_confirm'
  | 'sample_confirm'
  | 'receipt'
  | 'publication'
  | 'ad_auth'
  | 'followup_performance';

export interface CreateCCOSTemplateVersionInput {
  workspaceId: string;
  type: CCOSTemplateType;
  subject: string;
  body: string;
  variables?: string[];
}

function extractTemplateVariables(subject: string, body: string): string[] {
  const variables = new Set<string>();
  for (const text of [subject, body]) {
    for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) variables.add(match[1]);
  }
  return [...variables].sort();
}

function assertTemplateDefinition(subject: string, body: string, declaredVariables: string[]): void {
  const withoutValidPlaceholders = `${subject}\n${body}`.replace(/\{\{\w+\}\}/g, '');
  if (withoutValidPlaceholders.includes('{{') || withoutValidPlaceholders.includes('}}')) {
    throw new Error('Invalid CCOS template definition: malformed placeholder');
  }
  const actual = extractTemplateVariables(subject, body);
  const declared = [...new Set(declaredVariables)].sort();
  if (declared.length !== declaredVariables.length || actual.join('\0') !== declared.join('\0')) {
    throw new Error('Invalid CCOS template definition: declared variables must exactly match placeholders');
  }
}

export interface CCOSTemplateVersionRecord {
  id: string;
  workspaceId: string;
  type: CCOSTemplateType;
  version: number;
  subject: string;
  body: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CCOInteractionSourceRecord {
  id: string;
  workspaceId: string;
  interactionId: string;
  sourceType: string;
  sourceId: string;
  createdAt: Date;
}

export interface CreateCCOSInteractionInput {
  workspaceId: string;
  partnershipId: string;
  direction: 'inbound' | 'outbound' | 'system';
  channel: string;
  summary: string;
  occurredAt?: Date;
  source?: string;
  templateVersionId?: string;
  sourceLinks?: Array<{ sourceType: CCOSInteractionSourceType; sourceId: string }>;
}

export type CCOSInteractionSourceType = 'product' | 'content' | 'partnership' | 'action' | 'template_version';

export interface CCOSInteractionRecord {
  id: string;
  workspaceId: string;
  partnershipId: string;
  direction: 'inbound' | 'outbound' | 'system';
  channel: string;
  summary: string;
  occurredAt: Date;
  source: string;
  createdAt: Date;
  templateVersionId: string | null;
}

type TemplateVersionRow = {
  id: string; workspace_id: string; type: CCOSTemplateType; version: number;
  subject: string; body: string; variables: string[]; created_at: Date; updated_at: Date;
};

type TemplateUsageRow = {
  id: string; workspace_id: string; template_version_id: string; interaction_id: string; used_at: Date;
};

type InteractionSourceRow = {
  id: string; workspace_id: string; interaction_id: string; source_type: string; source_id: string; created_at: Date;
};

type InteractionRow = {
  id: string; workspace_id: string; partnership_id: string; direction: string;
  channel: string; summary: string; occurred_at: Date; source: string; created_at: Date; template_version_id: string | null;
};

const TEMPLATE_VERSION_COLUMNS = 'id, workspace_id, type, version, subject, body, variables, created_at, updated_at';
const INTERACTION_COLUMNS = 'id, workspace_id, partnership_id, direction, channel, summary, occurred_at, source, created_at, template_version_id';

function mapTemplateVersion(row: TemplateVersionRow): CCOSTemplateVersionRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, type: row.type, version: row.version,
    subject: row.subject, body: row.body, variables: row.variables,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapInteraction(row: InteractionRow): CCOSInteractionRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, partnershipId: row.partnership_id,
    direction: row.direction as 'inbound' | 'outbound' | 'system',
    channel: row.channel, summary: row.summary, occurredAt: row.occurred_at,
    source: row.source, createdAt: row.created_at, templateVersionId: row.template_version_id,
  };
}

function mapInteractionSource(row: InteractionSourceRow): CCOInteractionSourceRecord {
  return {
    id: row.id, workspaceId: row.workspace_id, interactionId: row.interaction_id,
    sourceType: row.source_type, sourceId: row.source_id, createdAt: row.created_at,
  };
}
