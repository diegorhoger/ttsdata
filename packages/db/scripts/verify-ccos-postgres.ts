import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const CCOS_TABLES = [
  'ai_global_controls', 'ai_tenant_controls', 'ai_user_controls', 'ai_keys', 'ai_consents', 'ai_reservations', 'ai_usage_ledger', 'ai_audit', 'ai_dispatch_leases',
  'ccos_stores',
  'ccos_partnerships',
  'ccos_products',
  'ccos_contents',
  'ccos_interactions',
  'ccos_interaction_sources',
  'ccos_template_versions',
  'ccos_template_usage',
  'ccos_next_actions',
  'ccos_metric_snapshots',
  'ccos_performance_snapshots',
  'ccos_production_queue_state',
  'ccos_production_queue_audit',
  'ccos_opportunity_states',
  'ccos_opportunity_history',
] as const;
type ForeignKeyExpectation = {
  name: string;
  sourceTable: string;
  sourceColumns: string[];
  targetTable: string;
  targetColumns: string[];
  deleteAction: 'c' | 'r' | 'a';
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
  deleteAction: 'c' | 'r' | 'a' = 'c',
): ForeignKeyExpectation => ({
  name,
  sourceTable,
  sourceColumns: ['workspace_id', targetColumn],
  targetTable,
  targetColumns: ['workspace_id', 'id'],
  deleteAction,
});

const CCOS_FOREIGN_KEYS: ForeignKeyExpectation[] = [
  workspaceForeignKey('ccos_opportunity_states'),
  workspaceForeignKey('ccos_opportunity_history'),
  tenantForeignKey('ccos_opportunity_states_workspace_partnership_fk', 'ccos_opportunity_states', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_opportunity_history_workspace_partnership_fk', 'ccos_opportunity_history', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_opportunity_history_workspace_actor_fk', 'ccos_opportunity_history', 'actor_user_id', 'users', 'a'),
  tenantForeignKey('ccos_opportunity_history_workspace_action_fk', 'ccos_opportunity_history', 'action_id', 'ccos_next_actions', 'a'),
  workspaceForeignKey('ccos_production_queue_state'),
  workspaceForeignKey('ccos_production_queue_audit'),
  tenantForeignKey('ccos_queue_audit_workspace_actor_fk', 'ccos_production_queue_audit', 'actor_user_id', 'users', 'r'),
  workspaceForeignKey('ccos_contents'),
  tenantForeignKey('ccos_contents_workspace_product_fk', 'ccos_contents', 'product_id', 'ccos_products'),
  workspaceForeignKey('ccos_interactions'),
  tenantForeignKey('ccos_interactions_workspace_partnership_fk', 'ccos_interactions', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_interactions_workspace_template_version_fk', 'ccos_interactions', 'template_version_id', 'ccos_template_versions', 'a'),
  workspaceForeignKey('ccos_interaction_sources'),
  tenantForeignKey('ccos_interaction_sources_workspace_interaction_fk', 'ccos_interaction_sources', 'interaction_id', 'ccos_interactions'),
  workspaceForeignKey('ccos_template_versions'),
  workspaceForeignKey('ccos_template_usage'),
  tenantForeignKey('ccos_template_usage_workspace_template_version_fk', 'ccos_template_usage', 'template_version_id', 'ccos_template_versions', 'a'),
  tenantForeignKey('ccos_template_usage_workspace_interaction_fk', 'ccos_template_usage', 'interaction_id', 'ccos_interactions'),
  workspaceForeignKey('ccos_metric_snapshots'),
  tenantForeignKey('ccos_metric_snapshots_workspace_store_fk', 'ccos_metric_snapshots', 'store_id', 'ccos_stores'),
  tenantForeignKey('ccos_metric_snapshots_workspace_partnership_fk', 'ccos_metric_snapshots', 'partnership_id', 'ccos_partnerships'),
  tenantForeignKey('ccos_metric_snapshots_workspace_product_fk', 'ccos_metric_snapshots', 'product_id', 'ccos_products'),
  tenantForeignKey('ccos_metric_snapshots_workspace_content_fk', 'ccos_metric_snapshots', 'content_id', 'ccos_contents'),
  tenantForeignKey('ccos_metric_snapshots_workspace_interaction_fk', 'ccos_metric_snapshots', 'interaction_id', 'ccos_interactions'),
  workspaceForeignKey('ccos_performance_snapshots'),
  tenantForeignKey('ccos_performance_snapshots_workspace_content_fk', 'ccos_performance_snapshots', 'content_id', 'ccos_contents'),
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
const rollbackPaths = [
  resolve(migrationsFolder, 'rollback/0011_ai_dispatch_authorization.down.sql'),
  resolve(migrationsFolder, 'rollback/0010_ai_gateway.down.sql'),
  resolve(migrationsFolder, 'rollback/0009_yummy_fantastic_four.down.sql'),
  resolve(migrationsFolder, 'rollback/0008_red_the_santerians.down.sql'),
  resolve(migrationsFolder, 'rollback/0007_ccos_performance_snapshots.down.sql'),
  resolve(migrationsFolder, 'rollback/0006_nappy_raider.down.sql'),
  resolve(migrationsFolder, 'rollback/0005_free_human_robot.down.sql'),
  resolve(migrationsFolder, 'rollback/0004_brainy_black_bird.down.sql'),
  resolve(migrationsFolder, 'rollback/0003_silly_otto_octavius.down.sql'),
  resolve(migrationsFolder, 'rollback/0002_worried_lyja.down.sql'),
] as const;
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
      'packages/db/tests/production-queue/integration.test.ts',
      'packages/db/tests/opportunities/integration.test.ts',
      'apps/api/tests/ccos-dashboard.integration.test.ts',
      'packages/db/tests/ai/integration.test.ts',
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

async function getMigrationCreatedAt(): Promise<number[]> {
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries?: Array<{ tag?: string; when?: number }>;
  };
  const tags = ['0002_worried_lyja', '0003_silly_otto_octavius', '0004_brainy_black_bird', '0005_free_human_robot', '0006_nappy_raider', '0007_ccos_performance_snapshots', '0008_red_the_santerians', '0009_yummy_fantastic_four', '0010_ai_gateway', '0011_ai_dispatch_authorization'];
  const entries = tags.map((tag) => journal.entries?.find((entry) => entry.tag === tag));
  if (entries.some((entry) => !entry || typeof entry.when !== 'number')) {
    throw new Error('Migration journal is missing a CCOS migration entry');
  }
  return entries.map((entry) => entry!.when!);
}

async function assertForwardSchema(): Promise<void> {
  const aiChecks = await pool.query('SELECT conname FROM pg_constraint WHERE conname=ANY($1::text[]) AND convalidated', [['ai_global_singleton_check', 'ai_user_limits_check', 'ai_keys_shape_check', 'ai_reservations_shape_check', 'ai_usage_shape_check', 'ai_audit_shape_check', 'ai_dispatch_shape_check']]);
  if (aiChecks.rowCount !== 7) throw new Error('AI CHECK constraints are missing');
  const aiTriggers = await pool.query("SELECT 1 FROM pg_trigger WHERE tgname IN ('ai_usage_ledger_immutable','ai_audit_immutable','ai_dispatch_leases_immutable') AND tgenabled='O' AND NOT tgisinternal");
  if (aiTriggers.rowCount !== 3) throw new Error('AI append-only triggers are missing');
  const opportunityChecks = await pool.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[]) AND convalidated`, [['ccos_opportunity_states_revision_check', 'ccos_opportunity_history_shape_check']]);
  if (opportunityChecks.rowCount !== 2) throw new Error('Opportunity CHECK constraints are missing');
  const opportunityTrigger = await pool.query("SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ccos_opportunity_history'::regclass AND tgname = 'ccos_opportunity_history_immutable_trigger' AND tgenabled = 'O' AND NOT tgisinternal");
  if (opportunityTrigger.rowCount !== 1) throw new Error('Opportunity append-only trigger is missing');
  const deferredOpportunityRefs = await pool.query(`SELECT conname FROM pg_constraint
    WHERE conname = ANY($1::text[]) AND condeferrable AND condeferred`, [[
    'ccos_opportunity_history_workspace_actor_fk',
    'ccos_opportunity_history_workspace_action_fk',
  ]]);
  if (deferredOpportunityRefs.rowCount !== 2) throw new Error('Opportunity actor/action audit references must be initially deferred');
  const queueChecks = await pool.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`,
    [['ccos_queue_state_revision_check', 'ccos_queue_state_order_check', 'ccos_queue_audit_shape_check']]);
  if (queueChecks.rowCount !== 3) throw new Error('Production queue CHECK constraints are missing');
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

  const productColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ccos_products'
        AND column_name = ANY($1::text[])`,
    [['price_amount', 'currency', 'commission_rate', 'commission_amount', 'stock_state']],
  );
  if (productColumns.rowCount !== 5) {
    throw new Error(`Expected five product commercial/logistics columns, found ${productColumns.rowCount ?? 0}`);
  }

  const performanceColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ccos_performance_snapshots'
        AND column_name = ANY($1::text[])`,
    [['content_id', 'observed_at', 'views', 'clicks', 'orders', 'gmv', 'commission', 'conversion',
      'currency', 'classifications', 'provenance']],
  );
  if (performanceColumns.rowCount !== 11) {
    throw new Error(`Expected eleven performance snapshot columns, found ${performanceColumns.rowCount ?? 0}`);
  }
  const performanceChecks = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'public.ccos_performance_snapshots'::regclass
      AND conname = ANY($1::text[]) AND contype = 'c' AND convalidated = true`,
    [['ccos_performance_snapshots_non_negative_counts', 'ccos_performance_snapshots_non_negative_amounts',
      'ccos_performance_snapshots_currency_required', 'ccos_performance_snapshots_classification_provenance_shape']],
  );
  if (performanceChecks.rowCount !== 4) throw new Error('Missing validated performance snapshot value/provenance constraints');
  const performanceIdempotency = await pool.query<{ indisunique: boolean }>(
    `SELECT i.indisunique FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
     WHERE idx.relname = 'ccos_performance_snapshots_content_time_idx'
       AND tbl.relname = 'ccos_performance_snapshots'`,
  );
  if (performanceIdempotency.rowCount !== 1 || !performanceIdempotency.rows[0].indisunique) {
    throw new Error('Performance snapshot content/time key is not unique');
  }

  const actionColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ccos_next_actions'
        AND column_name = ANY($1::text[])`,
    [['rule_key', 'dedupe_key', 'waiting_reason', 'resolution_reason']],
  );
  if (actionColumns.rowCount !== 4) {
    throw new Error(`Expected four next-action automation columns, found ${actionColumns.rowCount ?? 0}`);
  }

  const interactionColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ccos_interactions'
        AND column_name = 'template_version_id'`,
  );
  if (interactionColumns.rowCount !== 1) throw new Error('Missing interaction template_version_id column');

  const authorizationColumns = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ccos_contents'
        AND column_name = ANY($1::text[])`,
    [['ad_authorization_status', 'ad_authorization_code', 'ad_authorization_created_at', 'ad_authorization_expires_at']],
  );
  if (authorizationColumns.rowCount !== 4) {
    throw new Error(`Expected four per-content ad authorization columns, found ${authorizationColumns.rowCount ?? 0}`);
  }
  const authorizationChecks = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint
      WHERE conrelid = 'public.ccos_contents'::regclass
        AND conname = ANY($1::text[]) AND contype = 'c' AND convalidated = true`,
    [['ccos_contents_ad_authorization_details', 'ccos_contents_ad_authorization_expiry',
      'ccos_contents_ads_authorized_lifecycle']],
  );
  if (authorizationChecks.rowCount !== 3) {
    throw new Error(`Expected three validated ad authorization checks, found ${authorizationChecks.rowCount ?? 0}`);
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
              SELECT a.attname::text
                FROM unnest(c.conkey) WITH ORDINALITY AS keys(attnum, position)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = keys.attnum
               ORDER BY keys.position
            ) AS source_columns,
            target.relname AS target_table,
            ARRAY(
              SELECT a.attname::text
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
  const rollbackSql = (await Promise.all(rollbackPaths.map((path) => readFile(path, 'utf8')))).join('\n');
  const migrationCreatedAt = await getMigrationCreatedAt();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(rollbackSql);
    const deleted = await client.query(
      'DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ANY($1::bigint[]) RETURNING id',
      [migrationCreatedAt],
    );
    if (deleted.rowCount !== rollbackPaths.length) {
      throw new Error(`Expected ${rollbackPaths.length} CCOS migration journal rows, removed ${deleted.rowCount ?? 0}`);
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
