import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { orderProductionQueue, scoreProductionCandidate, type QueueCandidate, type ProductionQueueOptions } from '../ccos/production-queue';

export class ProductionQueueConflict extends Error {}
export class ProductionQueueValidationError extends Error {}
const MAX_QUEUE_SIZE = 1000;
const eligibility = "p.status IN ('received', 'content_queue')";

export class CCOSProductionQueueRepository {
  constructor(private readonly pool: Pool) {}

  /** Read on a caller-owned snapshot transaction; never begins or ends that transaction. */
  async readSnapshot(client: PoolClient, workspaceId: string, options: ProductionQueueOptions = {}) {
    const asOf = options.asOf ?? new Date();
    const state = await client.query('SELECT revision, product_ids FROM ccos_production_queue_state WHERE workspace_id = $1', [workspaceId]);
    const result = await client.query(`
      SELECT p.id, p.name, p.status, p.priority, p.stock_state, p.commission_rate, p.updated_at, p.provenance,
        s.conversion, s.observed_at AS performance_at, s.provenance AS performance_provenance,
        s.provenance->>'source' AS performance_source, s.classifications->>'conversion' AS performance_classification,
        i.responsiveness, i.response_at
      FROM ccos_products p
      LEFT JOIN LATERAL (
        SELECT s.* FROM ccos_performance_snapshots s JOIN ccos_contents c
          ON c.workspace_id = s.workspace_id AND c.id = s.content_id
        WHERE s.workspace_id = $1 AND c.workspace_id = $1 AND c.product_id = p.id AND s.observed_at <= $2
        ORDER BY s.observed_at DESC, s.id ASC LIMIT 1
      ) s ON true
      LEFT JOIN LATERAL (
        SELECT 100.0 * count(*) FILTER (WHERE direction = 'inbound') / NULLIF(count(*), 0) AS responsiveness,
          max(occurred_at) AS response_at
        FROM ccos_interactions WHERE workspace_id = $1 AND partnership_id = p.partnership_id
          AND direction IN ('inbound', 'outbound') AND occurred_at <= $2
      ) i ON true
      WHERE p.workspace_id = $1 AND ${eligibility}
      ORDER BY p.id ASC LIMIT ${MAX_QUEUE_SIZE + 1}`, [workspaceId, asOf]);
    if (result.rows.length > MAX_QUEUE_SIZE) throw new ProductionQueueValidationError('Production queue exceeds 1000 products; narrow lifecycle eligibility before reordering');
    const items = result.rows.map((row) => scoreProductionCandidate({
      id: row.id, name: row.name, status: row.status, priority: row.priority, stockState: row.stock_state,
      commissionRate: row.commission_rate, updatedAt: row.updated_at, provenance: row.provenance,
      conversion: row.conversion, performanceAt: row.performance_at, performanceSource: row.performance_source,
      performanceClassification: row.performance_classification, performanceProvenance: row.performance_provenance,
      responsiveness: row.responsiveness === null ? null : Number(row.responsiveness), responseAt: row.response_at,
    } satisfies QueueCandidate, asOf));
    const eligibleIds = items.map((item) => item.id);
    const membershipToken = createHash('sha256').update(JSON.stringify(eligibleIds)).digest('hex');
    return {
      revision: state.rows[0]?.revision ?? 0, membershipToken, eligibleIds, asOf,
      manualOrder: (state.rows[0]?.product_ids ?? []) as string[],
      items: orderProductionQueue(items, state.rows[0]?.product_ids ?? [], options),
    };
  }

  async getProductionQueue(workspaceId: string, options: ProductionQueueOptions = {}) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const queue = await this.readSnapshot(client, workspaceId, options);
      await client.query('COMMIT');
      return queue;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async reorderProductionQueue(workspaceId: string, actorUserId: string, input: {
    expectedRevision: number; membershipToken: string; productIds: string[]; reason: string;
  }) {
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
      || input.productIds.length > MAX_QUEUE_SIZE || new Set(input.productIds).size !== input.productIds.length
      || !input.reason.trim() || input.reason.length > 2000) throw new ProductionQueueValidationError('Invalid queue reorder');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Workspace lock serializes initialization and reorder; eligible row locks also serialize lifecycle transitions.
      // NO KEY UPDATE serializes reorders while remaining compatible with FK KEY SHARE.
      // This avoids lock inversion with interaction creation, which locks a product first.
      const workspace = await client.query('SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE', [workspaceId]);
      if (!workspace.rowCount) throw new ProductionQueueValidationError('Workspace not found');
      const actor = await client.query('SELECT id FROM users WHERE workspace_id = $1 AND id = $2', [workspaceId, actorUserId]);
      if (!actor.rowCount) throw new ProductionQueueValidationError('Actor not found');
      await client.query('INSERT INTO ccos_production_queue_state (workspace_id) VALUES ($1) ON CONFLICT DO NOTHING', [workspaceId]);
      await client.query('SELECT revision FROM ccos_production_queue_state WHERE workspace_id = $1 FOR UPDATE', [workspaceId]);
      await client.query(`SELECT p.id FROM ccos_products p WHERE p.workspace_id = $1 AND ${eligibility} ORDER BY p.id FOR UPDATE`, [workspaceId]);
      const current = await this.readSnapshot(client, workspaceId);
      if (current.revision !== input.expectedRevision || current.membershipToken !== input.membershipToken) {
        throw new ProductionQueueConflict('Production queue changed; reload before reordering');
      }
      if (input.productIds.length !== current.eligibleIds.length || input.productIds.some((id) => !current.eligibleIds.includes(id))) {
        throw new ProductionQueueValidationError('Order must contain every eligible workspace product exactly once');
      }
      const updated = await client.query(`UPDATE ccos_production_queue_state SET revision = revision + 1, product_ids = $2::jsonb, updated_at = now()
        WHERE workspace_id = $1 AND revision = $3`, [workspaceId, JSON.stringify(input.productIds), input.expectedRevision]);
      if (updated.rowCount !== 1) throw new ProductionQueueConflict('Production queue changed; reload before reordering');
      await client.query(`INSERT INTO ccos_production_queue_audit (workspace_id, revision, actor_user_id, previous_order, new_order, reason)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [workspaceId, current.revision + 1, actorUserId, JSON.stringify(current.manualOrder), JSON.stringify(input.productIds), input.reason.trim()]);
      const queue = await this.readSnapshot(client, workspaceId);
      await client.query('COMMIT');
      return queue;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async listProductionQueueAudit(workspaceId: string) {
    const result = await this.pool.query(`SELECT id, revision, actor_user_id, previous_order, new_order, reason, created_at
      FROM ccos_production_queue_audit WHERE workspace_id = $1 ORDER BY revision DESC LIMIT 100`, [workspaceId]);
    return result.rows;
  }
}
