import { Pool } from 'pg';
import {
  assertPartnershipTransition,
  assertProductTransition,
  assertContentTransition,
  type ContentStatus,
  type PartnershipStatus,
  type ProductStatus,
} from '../ccos/lifecycle';

export type PartnershipType = 'inbound_invite' | 'outbound_prospecting' | 'affiliate' | 'paid_campaign' | 'gifting';
export type CCOSPriority = 'low' | 'normal' | 'high' | 'urgent';

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

const STORE_COLUMNS = 'id, workspace_id, name, contact_name, contact_email, notes, created_at, updated_at';
const PARTNERSHIP_COLUMNS = `id, workspace_id, store_id, type, status, title, terms, priority,
  last_contact_at, created_at, updated_at`;
const PRODUCT_COLUMNS = `id, workspace_id, partnership_id, name, sku, product_url, price_amount, currency,
  commission_rate, commission_amount, stock_state, status, tracking_code, shipped_at, received_at,
  priority, source, provenance, created_at, updated_at`;
const CONTENT_COLUMNS = `id, workspace_id, product_id, status, platform, format, concept,
  scheduled_at, published_at, publication_url, created_at, updated_at`;

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
    const result = await this.pool.query<PartnershipRow>(
      `INSERT INTO ccos_partnerships (workspace_id, store_id, type, title, terms, priority, last_contact_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${PARTNERSHIP_COLUMNS}`,
      [input.workspaceId, input.storeId, input.type, input.title ?? null, input.terms ?? null,
        input.priority ?? 'normal', input.lastContactAt ?? null],
    );
    if (result.rowCount !== 1) throw new Error('CCOS partnership insert did not return exactly one row');
    return mapPartnership(result.rows[0]);
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
    const result = await this.pool.query<ProductRow>(
      `INSERT INTO ccos_products
       (workspace_id, partnership_id, name, sku, product_url, price_amount, currency, commission_rate,
        commission_amount, stock_state, tracking_code, shipped_at, received_at, priority, source, provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING ${PRODUCT_COLUMNS}`,
      [input.workspaceId, input.partnershipId, input.name, input.sku ?? null, input.productUrl ?? null,
        input.priceAmount ?? null, input.currency ?? null, input.commissionRate ?? null,
        input.commissionAmount ?? null, input.stockState ?? null, input.trackingCode ?? null,
        input.shippedAt ?? null, input.receivedAt ?? null, input.priority ?? 'normal',
        input.source ?? 'manual', input.provenance ?? null],
    );
    if (result.rowCount !== 1) throw new Error('CCOS product insert did not return exactly one row');
    return mapProduct(result.rows[0]);
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
    const result = await this.pool.query<ContentRow>(
      `INSERT INTO ccos_contents (workspace_id, product_id, platform, format, concept)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${CONTENT_COLUMNS}`,
      [input.workspaceId, input.productId, input.platform, input.format ?? null, input.concept ?? null],
    );
    if (result.rowCount !== 1) throw new Error('CCOS content insert did not return exactly one row');
    return mapContent(result.rows[0]);
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
