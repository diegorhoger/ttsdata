import { Pool } from 'pg';
import { assertPartnershipTransition, type PartnershipStatus } from '../ccos/lifecycle';

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

type StoreRow = {
  id: string; workspace_id: string; name: string; contact_name: string | null;
  contact_email: string | null; notes: string | null; created_at: Date; updated_at: Date;
};
type PartnershipRow = {
  id: string; workspace_id: string; store_id: string; type: PartnershipType;
  status: PartnershipStatus; title: string | null; terms: string | null; priority: CCOSPriority;
  last_contact_at: Date | null; created_at: Date; updated_at: Date;
};

const STORE_COLUMNS = 'id, workspace_id, name, contact_name, contact_email, notes, created_at, updated_at';
const PARTNERSHIP_COLUMNS = `id, workspace_id, store_id, type, status, title, terms, priority,
  last_contact_at, created_at, updated_at`;

function mapStore(row: StoreRow): CCOSStoreRecord {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, contactName: row.contact_name,
    contactEmail: row.contact_email, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapPartnership(row: PartnershipRow): CCOSPartnershipRecord {
  return { id: row.id, workspaceId: row.workspace_id, storeId: row.store_id, type: row.type,
    status: row.status, title: row.title, terms: row.terms, priority: row.priority,
    lastContactAt: row.last_contact_at, createdAt: row.created_at, updatedAt: row.updated_at };
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

  async close(): Promise<void> { if (this.ownsPool) await this.pool.end(); }
}
