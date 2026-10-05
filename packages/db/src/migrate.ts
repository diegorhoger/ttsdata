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
import { existsSync } from 'node:fs';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

// The migrator runs from two different locations:
//   tsx (dev):      packages/db/src/migrate.ts   -> package root is '..'
//   node (prod):    packages/db/dist/src/migrate.js -> package root is '../..'
// Resolve the package root by walking up to the directory containing
// package.json, so both invocation paths find packages/db/drizzle.
function findPackageRoot(start: string): string {
  let dir = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(resolve(dir, 'package.json'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate the package root above ${start}`);
}

const migrationsFolder = process.env.MIGRATIONS_FOLDER?.trim()
  || resolve(findPackageRoot(__dirname), 'drizzle');

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
