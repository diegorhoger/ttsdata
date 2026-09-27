import { Pool } from 'pg';

export interface CreateCCOSStoreInput {
  workspaceId: string;
  name: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
}

export interface CreateCCOSPartnershipInput {
  workspaceId: string;
  storeId: string;
  type: 'inbound_invite' | 'outbound_prospecting' | 'affiliate' | 'paid_campaign' | 'gifting';
  title?: string;
}

export interface CCOSStoreRecord {
  id: string;
  workspaceId: string;
  name: string;
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
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      name: string;
    }>(
      `INSERT INTO ccos_stores (workspace_id, name, contact_name, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workspace_id, name`,
      [input.workspaceId, input.name, input.contactName ?? null, input.contactEmail ?? null, input.notes ?? null],
    );

    if (result.rowCount !== 1) throw new Error('CCOS store insert did not return exactly one row');
    const row = result.rows[0];
    return { id: row.id, workspaceId: row.workspace_id, name: row.name };
  }

  async getStore(workspaceId: string, storeId: string): Promise<CCOSStoreRecord | null> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      name: string;
    }>(
      `SELECT id, workspace_id, name
       FROM ccos_stores
       WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, storeId],
    );
    const row = result.rows[0];
    return row ? { id: row.id, workspaceId: row.workspace_id, name: row.name } : null;
  }

  async createPartnership(input: CreateCCOSPartnershipInput): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO ccos_partnerships (workspace_id, store_id, type, title)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [input.workspaceId, input.storeId, input.type, input.title ?? null],
    );
    if (result.rowCount !== 1) throw new Error('CCOS partnership insert did not return exactly one row');
    return { id: result.rows[0].id };
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}
