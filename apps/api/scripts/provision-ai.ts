/** Deployment-operator-only provisioning; never expose this through a public HTTP endpoint. */
import 'dotenv/config';
import { Pool } from 'pg';
import { AIRepository, AIKeyCipher } from '@ttsdata/db';
import { OpenRouterProvider } from '../src/ai/openrouter';

async function main() {
  const workspaceId = process.env.AI_PROVISION_WORKSPACE_ID; const userId = process.env.AI_PROVISION_USER_ID;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!workspaceId || !userId || !uuid.test(workspaceId) || !uuid.test(userId) || !process.env.DATABASE_URL) throw new Error();
  const cipher = new AIKeyCipher(JSON.parse(process.env.AI_ENCRYPTION_KEYS ?? '{}'), Number(process.env.AI_ENCRYPTION_VERSION));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const repository = new AIRepository(pool, cipher); const identity = { workspaceId, userId };
    const key = process.env.AI_PLATFORM_OPENROUTER_KEY;
    const operation = process.env.AI_PLATFORM_OPERATION ?? 'replace';
    if (!['replace', 'disable', 'delete'].includes(operation)) throw new Error();
    if (operation === 'disable' || operation === 'delete') await repository.changeKey(identity, 'platform', operation);
    else if (key) {
      const validation = await new OpenRouterProvider().validateKey(key, AbortSignal.timeout(10000));
      if (validation.state !== 'valid') throw new Error();
      await repository.putKey(identity, 'platform', key, true);
    }
    await repository.configureTenant(identity, process.env.AI_ENABLE_TENANT === 'true');
    await repository.configure(identity, process.env.AI_ENABLE_USER === 'true');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ai:${workspaceId}:${userId}`]);
      await client.query('UPDATE ai_user_controls SET platform_enabled=$3 WHERE workspace_id=$1 AND user_id=$2', [workspaceId, userId, process.env.AI_ENABLE_PLATFORM === 'true']);
      await client.query('UPDATE ai_global_controls SET enabled=$1 WHERE singleton=true', [process.env.AI_ENABLE_GLOBAL === 'true']);
      await client.query("INSERT INTO ai_audit(workspace_id,user_id,action,metadata) VALUES($1,$2,'ai.deployment.provision',$3::jsonb)", [workspaceId, userId, JSON.stringify({ actor: 'deployment-operator', globalEnabled: process.env.AI_ENABLE_GLOBAL === 'true', platformEnabled: process.env.AI_ENABLE_PLATFORM === 'true' })]);
      await client.query('COMMIT');
    } catch { await client.query('ROLLBACK'); throw new Error(); } finally { client.release(); }
  } finally { await pool.end(); }
}
main().catch(() => { process.stderr.write('AI provisioning failed. Check deployment configuration.\n'); process.exitCode = 1; });
