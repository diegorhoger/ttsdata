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
type ForeignKeyExpectation = {
  name: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  deleteAction: 'c' | 'r';
};

const workspaceForeignKey = (sourceTable: string): ForeignKeyExpectation => ({
  name: `${sourceTable}_workspace_id_workspaces_id_fk`,
  sourceTable,
  sourceColumns: ['workspace_id'],
  targetTable: 'workspaces',
  targetColumns: ['id'],
  deleteAction: 'c',
});

const tenantForeignKey = (
  name: string,
  sourceTable: string,
  targetColumn: string,
  targetTable: string,
  deleteAction: 'c' | 'r' = 'c',
): ForeignKeyExpectation => ({
  name,
  sourceTable,
  sourceColumns: ['workspace_id', targetColumn],
  targetTable,
  targetColumns: ['workspace_id', 'id'],
  deleteAction,
});

const CCOS_FOREIGN_KEYS: ForeignKeyExpectation[] = [
  workspaceForeignKey('ccos_contents'),
  tenantForeignKey('ccos_contents_workspace_product_fk', 'ccos_contents', 'product_id', 'ccos_products'),
  workspaceForeignKey('ccos_interactions'),
  tenantForeignKey('ccos_interactions_workspace_partnership_fk', 'ccos_interactions', 'partnership_id', 'ccos_partnerships'),
  workspaceForeignKey('ccos_metric_snapshots'),
  tenantForeignKey('ccos_metric_snapshots_workspace_store_fk', 'ccos_metric_snapshots', 'store_id', 'ccos_stores'),
  tenantForeignKey('ccos_metric_snapshots_workspace_partnership_fk', 'ccos_metric_snapshots', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_metric_snapshots_workspace_product_fk', 'ccos_metric_snapshots', 'product_id', 'ccos_products'),
  tenantForeignKey('ccos_metric_snapshots_workspace_content_fk', 'ccos_metric_snapshots', 'content_id', 'ccos_contents'),
  tenantForeignKey('ccos_metric_snapshots_workspace_interaction_fk', 'ccos_metric_snapshots', 'interaction_id', 'ccos_interactions'),
  workspaceForeignKey('ccos_next_actions'),
  tenantForeignKey('ccos_next_actions_workspace_owner_fk', 'ccos_next_actions', 'owner_user_id', 'users', 'r'),
  tenantForeignKey('ccos_next_actions_workspace_store_fk', 'ccos_next_actions', 'store_id', 'ccos_stores'),
  tenantForeignKey('ccos_next_actions_workspace_partnership_fk', 'ccos_next_actions', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_next_actions_workspace_product_fk', 'ccos_next_actions', 'product_id', 'ccos_products'),
  tenantForeignKey('ccos_next_actions_workspace_content_fk', 'ccos_next_actions', 'content_id', 'ccos_contents'),
  tenantForeignKey('ccos_next_actions_workspace_interaction_fk', 'ccos_next_actions', 'interaction_id', 'ccos_interactions'),
  workspaceForeignKey('ccos_partnerships'),
  tenantForeignKey('ccos_partnerships_workspace_store_fk', 'ccos_partnerships', 'store_id', 'ccos_stores'),
  workspaceForeignKey('ccos_products'),
  tenantForeignKey('ccos_products_workspace_partnership_fk', 'ccos_products', 'partnership_id', 'ccos_partnerships'),
  workspaceForeignKey('ccos_stores'),
];

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

  const foreignKeys = await pool.query<{
    name: string;
    source_table: string;
    source_columns: string[];
    target_table: string;
    target_columns: string[];
    delete_action: string;
    validated: boolean;
  }>(
    `SELECT c.conname AS name,
            source.relname AS source_table,
            ARRAY(
              SELECT a.attname
                FROM unnest(c.conkey) WITH ORDINALITY AS keys(attnum, position)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = keys.attnum
               ORDER BY keys.position
            ) AS source_columns,
            target.relname AS target_table,
            ARRAY(
              SELECT a.attname
                FROM unnest(c.confkey) WITH ORDINALITY AS keys(attnum, position)
                JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = keys.attnum
               ORDER BY keys.position
            ) AS target_columns,
            c.confdeltype AS delete_action,
            c.convalidated AS validated
       FROM pg_constraint c
       JOIN pg_class source ON source.oid = c.conrelid
       JOIN pg_class target ON target.oid = c.confrelid
      WHERE c.contype = 'f' AND c.conname = ANY($1::text[])
      ORDER BY c.conname`,
    [CCOS_FOREIGN_KEYS.map(({ name }) => name)],
  );
  const actualForeignKeys = new Map(foreignKeys.rows.map((row) => [row.name, row]));
  for (const expected of CCOS_FOREIGN_KEYS) {
    const actual = actualForeignKeys.get(expected.name);
    if (!actual) {
      throw new Error(`Missing CCOS tenant foreign key: ${expected.name}`);
    }
    const matches = actual.source_table === expected.sourceTable
      && JSON.stringify(actual.source_columns) === JSON.stringify(expected.sourceColumns)
      && actual.target_table === expected.targetTable
      && JSON.stringify(actual.target_columns) === JSON.stringify(expected.targetColumns)
      && actual.delete_action === expected.deleteAction
      && actual.validated;
    if (!matches) {
      throw new Error(`Incorrect CCOS tenant foreign key definition: ${expected.name}`);
    }
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(rollbackSql);
    const deleted = await client.query(
      'DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1 RETURNING id',
      [migrationCreatedAt],
    );
    if (deleted.rowCount !== 1) {
      throw new Error(`Expected one CCOS migration journal row, removed ${deleted.rowCount ?? 0}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
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
