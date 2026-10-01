import type { Pool } from 'pg';
import { CCOSRepository } from './ccos';
import { CCOSProductionQueueRepository } from './production-queue';
import { buildDashboard } from '../ccos/dashboard';

export class CCOSDashboardRepository {
  constructor(private readonly pool: Pool) {}

  async getDashboard(workspaceId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const clock = await client.query<{ as_of: Date }>('SELECT transaction_timestamp() AS as_of');
      const asOf = clock.rows[0].as_of;
      // These list methods only query. Binding query to the client keeps every projection in one snapshot.
      const repository = new CCOSRepository({ query: client.query.bind(client) } as unknown as Pool);
      const stores = await repository.listStores(workspaceId);
      const partnerships = await repository.listPartnerships(workspaceId);
      const products = await repository.listProducts(workspaceId);
      const contents = await repository.listContents(workspaceId);
      const nextActions = await repository.listAttentionInbox(workspaceId);
      const performance = await repository.listPerformanceSnapshots(workspaceId, { to: asOf });
      // The dashboard returns the same canonical timeline records (including source links)
      // as the detail route, and all reads remain bound to this snapshot client.
      const interactions = (await Promise.all(
        partnerships.map((partnership) => repository.listTimeline(workspaceId, partnership.id)),
      )).flat();
      const production = await new CCOSProductionQueueRepository(this.pool).readSnapshot(client, workspaceId, { asOf });
      const dashboard = buildDashboard({ stores, partnerships, products, contents, nextActions, performance, interactions }, asOf);
      await client.query('COMMIT');
      return { ...dashboard, production, counts: { ...dashboard.counts, production: production.items.length } };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
