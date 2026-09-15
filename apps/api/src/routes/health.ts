/**
 * Health check endpoints
 */

import { FastifyInstance } from 'fastify';
import { db } from '../lib/db';
import { sql } from 'drizzle-orm';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/', async () => {
    try {
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'connected' };
    } catch (err) {
      return { status: 'error', database: 'disconnected' };
    }
  });

  app.get('/deep', async () => {
    const checks: Record<string, string> = {};
    
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }

    return {
      status: Object.values(checks).every(v => v === 'ok') ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  });
}
