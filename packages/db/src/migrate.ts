/**
 * Run database migrations.
 *
 * Executed as compiled JavaScript (`node dist/src/migrate.js`) so the
 * production image does not need TypeScript tooling. `tsx` is a devDependency
 * and is pruned from the runtime stage, so a `tsx`-based migration command
 * would be unrunnable in the artifact this repository actually deploys.
 *
 * The migrations folder is resolved relative to this module, not the process
 * working directory, so the command behaves identically regardless of where it
 * is invoked from inside the image.
 */
import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { resolve } from 'node:path';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

// Compiled location is packages/db/dist/src/migrate.js, so the migrations
// folder sits two levels up at packages/db/drizzle. `__dirname` is the CommonJS
// equivalent and needs no ESM interop.
const migrationsFolder = process.env.MIGRATIONS_FOLDER?.trim() || resolve(__dirname, '../../drizzle');

const pool = new Pool({ connectionString });
const database = drizzle(pool, { schema });

async function main() {
  console.log(`Running migrations from ${migrationsFolder}...`);
  await migrate(database, { migrationsFolder });
  console.log('Migrations complete.');
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await pool.end().catch(() => undefined);
    process.exitCode = 1;
  });
