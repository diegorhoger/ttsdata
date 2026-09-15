/**
 * Run database migrations
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://ttsdata:ttsdata@host.docker.internal:5432/ttsdata',
});

const database = drizzle(pool, { schema });

async function main() {
  console.log('Running migrations...');
  console.log('DB URL:', process.env.DATABASE_URL);
  await migrate(database, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
