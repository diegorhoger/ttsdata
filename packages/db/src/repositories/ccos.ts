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
  published_at: Date | null; publication_url: string | null; created_at: Date; updated_at: Date;
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
  scheduled_at, published_at, publication_url, created_at, updated_at`;
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
    await client.query(
      `UPDATE ccos_next_actions
          SET status = 'cancelled', completed_at = NOW(), resolution_reason = $3, updated_at = NOW()
        WHERE workspace_id = $1 AND ${targetColumn} = $2 AND generated_automatically = true
          AND status IN ('open', 'in_progress', 'waiting') AND rule_key IS DISTINCT FROM $4`,
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
                c.scheduled_at, c.published_at, c.publication_url, c.created_at, c.updated_at,
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
      if (updates.length === 0) {
        await client.query('COMMIT');
        return current;
      }
      const result = await client.query<ContentRow>(
        `UPDATE ccos_contents SET ${updates.join(', ')}, updated_at = NOW()
         WHERE workspace_id = $1 AND id = $2 RETURNING ${CONTENT_COLUMNS}`, values,
      );
      if (statusChanged || metadataChanged) {
        const summary = statusChanged
          ? `Content ${current.id} lifecycle changed: ${current.status} -> ${input.status}${metadataChanged ? '; publication metadata updated' : ''}`
          : `Content ${current.id} publication metadata updated`;
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
      await client.query('COMMIT');
      return result.rows[0] ? mapContent(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }
}
