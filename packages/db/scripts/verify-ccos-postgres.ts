import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const CCOS_TABLES = [
  'ccos_stores',
  'ccos_partnerships',
  'ccos_products',
  'ccos_contents',
  'ccos_interactions',
  'ccos_next_actions',
  'ccos_metric_snapshots',
] as const;

if (!TEST_DATABASE_URL) {
  throw new Error('CCOS PostgreSQL verification requires TEST_DATABASE_URL');
}

const parsedUrl = new URL(TEST_DATABASE_URL);
if (!parsedUrl.pathname.slice(1).endsWith('_test')) {
  throw new Error('CCOS PostgreSQL verification requires a database name ending in _test');
}

const packageRoot = resolve(process.cwd());
const migrationsFolder = resolve(packageRoot, 'drizzle');
const rollbackPath = resolve(migrationsFolder, 'rollback/0002_worried_lyja.down.sql');
const journalPath = resolve(migrationsFolder, 'meta/_journal.json');
const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const database = drizzle(pool);

async function runConstraintTests(): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('pnpm', [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.ts',
      'packages/db/tests/ccos/integration.test.ts',
    ], {
      cwd: resolve(packageRoot, '../..'),
      env: { ...process.env, TEST_DATABASE_URL },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`CCOS constraint tests failed (exit=${String(code)}, signal=${String(signal)})`));
      }
    });
  });
}

async function getMigrationCreatedAt(): Promise<number> {
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries?: Array<{ tag?: string; when?: number }>;
  };
  const entry = journal.entries?.find(({ tag }) => tag === '0002_worried_lyja');
  if (!entry || typeof entry.when !== 'number') {
    throw new Error('Migration journal is missing 0002_worried_lyja');
  }
  return entry.when;
}

async function assertForwardSchema(): Promise<void> {
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name`,
    [CCOS_TABLES],
  );
  if (tables.rowCount !== CCOS_TABLES.length) {
    throw new Error(`Expected ${CCOS_TABLES.length} CCOS tables, found ${tables.rowCount ?? 0}`);
  }

  const constraints = await pool.query<{ constraint_name: string }>(
    `SELECT constraint_name
       FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND constraint_name IN (
          'ccos_next_actions_exactly_one_target',
          'ccos_metric_snapshots_exactly_one_target'
        )`,
  );
  if (constraints.rowCount !== 2) {
    throw new Error(`Expected both exactly-one-target constraints, found ${constraints.rowCount ?? 0}`);
  }

  const ownerForeignKey = await pool.query(
    `SELECT 1
       FROM pg_constraint
      WHERE conname = 'ccos_next_actions_workspace_owner_fk'`,
  );
  if (ownerForeignKey.rowCount !== 1) {
    throw new Error('Missing workspace-bound Next Action owner foreign key');
  }
}

async function assertRolledBack(): Promise<void> {
  const tables = await pool.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [CCOS_TABLES],
  );
  if (tables.rowCount !== 0) {
    throw new Error(`Rollback left ${tables.rowCount ?? 0} CCOS tables behind`);
  }

  const ownedIndex = await pool.query(
    `SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'users_workspace_id_id_idx'`,
  );
  if (ownedIndex.rowCount !== 0) {
    throw new Error('Rollback left the CCOS-owned users composite index behind');
  }
}

async function main(): Promise<void> {
  console.log('1/4 Applying migrations to explicit test database...');
  await migrate(database, { migrationsFolder });
  await assertForwardSchema();

  console.log('2/4 Running CCOS PostgreSQL constraint tests...');
  await runConstraintTests();

  console.log('3/4 Applying reviewed rollback and checking removal...');
  const rollbackSql = await readFile(rollbackPath, 'utf8');
  const migrationCreatedAt = await getMigrationCreatedAt();
  await pool.query('BEGIN');
  try {
    await pool.query(rollbackSql);
    const deleted = await pool.query(
      'DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1 RETURNING id',
      [migrationCreatedAt],
    );
    if (deleted.rowCount !== 1) {
      throw new Error(`Expected one CCOS migration journal row, removed ${deleted.rowCount ?? 0}`);
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  await assertRolledBack();

  console.log('4/4 Reapplying migration and rerunning constraints...');
  await migrate(database, { migrationsFolder });
  await assertForwardSchema();
  await runConstraintTests();

  console.log('CCOS PostgreSQL forward/constraints/rollback/reapply verification passed.');
}

main()
  .catch((error: unknown) => {
    console.error('CCOS PostgreSQL verification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
