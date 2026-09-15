/**
 * Drizzle ORM connection pool
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@ttsdata/db/src/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ttsdata:ttsdata@host.docker.internal:5432/ttsdata',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });
export { schema };
export type Database = typeof db;
