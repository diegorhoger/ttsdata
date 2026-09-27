/**
 * Run database migrations
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

const pool = new Pool({ connectionString });

const database = drizzle(pool, { schema });

async function main() {
  console.log('Running migrations...');
  await migrate(database, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  void pool.end().finally(() => {
    process.exitCode = 1;
  });
});
