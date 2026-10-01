import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { AIError, AI_DISCLOSURE_VERSION, type AIKeyMode, type AIResult } from '@ttsdata/shared';
import { AIKeyCipher } from '../ai-crypto';

export type AIIdentity = { workspaceId: string; userId: string };
export type AIKeyMetadata = { id: string; mode: AIKeyMode; provider: string; fingerprint: string; enabled: boolean; revision: number; encryptionVersion: number; validatedAt: Date | null; expiresAt: Date | null };
export type AIReservationInput = { id: string; mode: AIKeyMode; provider: string; model: string; requests: number; tokens: number; costUsd: string };
export type AIDispatchInput = { requestId: string; attempt: number; mode: AIKeyMode; model: string; provider: string; keyId: string; keyRevision: number };
export type AIFinalization = { id: string; mode: AIKeyMode; model: string; provider: string; promptVersion: string; schemaVersion: string; attempts: number; latencyMs: number; result?: AIResult; errorCode?: string; unknown: boolean };
const keyContext = (identity: AIIdentity, mode: AIKeyMode, provider: string) => `${identity.workspaceId}:${identity.userId}:${mode}:${provider}`;
const keyColumns = 'id, mode, provider, fingerprint, enabled, revision, encryption_version AS "encryptionVersion", validated_at AS "validatedAt", expires_at AS "expiresAt"';
function validateProvider(provider: string) { if (!/^[a-z][a-z0-9_-]{0,63}$/.test(provider)) throw new AIError('INVALID_REQUEST'); }

export class AIRepository {
  constructor(private readonly pool: Pool, private readonly cipher: AIKeyCipher) {}
  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const result = await operation(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  private async lock(client: PoolClient, identity: AIIdentity) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`ai:${identity.workspaceId}:${identity.userId}`]);
    const user = await client.query('SELECT 1 FROM users WHERE workspace_id=$1 AND id=$2', [identity.workspaceId, identity.userId]);
    if (!user.rowCount) throw new AIError('INVALID_REQUEST');
  }
  private audit(client: PoolClient, identity: AIIdentity, action: string, targetId?: string, metadata: object = {}) {
    return client.query('INSERT INTO ai_audit(workspace_id,user_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
      [identity.workspaceId, identity.userId, action, targetId ?? null, JSON.stringify(metadata)]);
  }
  async putKey(identity: AIIdentity, mode: AIKeyMode, provider: string, raw: string, validated: boolean, expiresAt?: Date): Promise<AIKeyMetadata> {
    validateProvider(provider);
    if (raw.length < 16 || raw.length > 4096 || /\s/.test(raw)) throw new AIError('KEY_INVALID');
    const encrypted = this.cipher.encrypt(raw, keyContext(identity, mode, provider)); const fingerprint = this.cipher.fingerprint(raw);
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      const result = await client.query<AIKeyMetadata>(`INSERT INTO ai_keys(workspace_id,user_id,mode,provider,encrypted_key,encryption_version,fingerprint,validated_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,user_id,mode,provider)
        DO UPDATE SET encrypted_key=EXCLUDED.encrypted_key,encryption_version=EXCLUDED.encryption_version,fingerprint=EXCLUDED.fingerprint,
          validated_at=EXCLUDED.validated_at,expires_at=EXCLUDED.expires_at,enabled=true,revision=ai_keys.revision+1,updated_at=now() RETURNING ${keyColumns}`,
      [identity.workspaceId, identity.userId, mode, provider, encrypted.encrypted, encrypted.version, fingerprint, validated ? new Date() : null, expiresAt ?? null]);
      await this.audit(client, identity, 'ai.key.replace', result.rows[0].id, { mode, provider, fingerprint, encryptionVersion: encrypted.version });
      return result.rows[0];
    });
  }
  async listKeys(identity: AIIdentity) {
    return (await this.pool.query<AIKeyMetadata>(`SELECT ${keyColumns} FROM ai_keys WHERE workspace_id=$1 AND user_id=$2 ORDER BY mode`, [identity.workspaceId, identity.userId])).rows;
  }
  async credential(identity: AIIdentity, mode: AIKeyMode, provider: string): Promise<{ key: string; id: string; revision: number }> {
    validateProvider(provider);
    const result = await this.pool.query(`SELECT id,revision,encrypted_key,encryption_version,enabled,expires_at,validated_at FROM ai_keys WHERE workspace_id=$1 AND user_id=$2 AND mode=$3 AND provider=$4`, [identity.workspaceId, identity.userId, mode, provider]);
    const row = result.rows[0]; if (!row) throw new AIError('KEY_MISSING'); if (!row.enabled) throw new AIError('KEY_DISABLED');
    if (!row.validated_at) throw new AIError('KEY_INVALID');
    if (row.expires_at && row.expires_at <= new Date()) throw new AIError('KEY_EXPIRED');
    try { return { id: row.id, revision: row.revision, key: this.cipher.decrypt(row.encrypted_key, row.encryption_version, keyContext(identity, mode, provider)) }; }
    catch { throw new AIError('KEY_INVALID'); }
  }
  async changeKey(identity: AIIdentity, mode: AIKeyMode, provider: string, operation: 'disable' | 'delete') {
    validateProvider(provider);
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      const result = await client.query(operation === 'delete'
        ? 'DELETE FROM ai_keys WHERE workspace_id=$1 AND user_id=$2 AND mode=$3 AND provider=$4 RETURNING id'
        : 'UPDATE ai_keys SET enabled=false,revision=revision+1,updated_at=now() WHERE workspace_id=$1 AND user_id=$2 AND mode=$3 AND provider=$4 RETURNING id', [identity.workspaceId, identity.userId, mode, provider]);
      if (result.rowCount) await this.audit(client, identity, `ai.key.${operation}`, result.rows[0].id, { mode, provider });
      return Boolean(result.rowCount);
    });
  }
  async consent(identity: AIIdentity, requireZdr: boolean) {
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      await client.query(`INSERT INTO ai_consents(workspace_id,user_id,version,require_zdr) VALUES($1,$2,$3,$4)
        ON CONFLICT(workspace_id,user_id) DO UPDATE SET version=EXCLUDED.version,require_zdr=EXCLUDED.require_zdr,accepted_at=now()`, [identity.workspaceId, identity.userId, AI_DISCLOSURE_VERSION, requireZdr]);
      await this.audit(client, identity, 'ai.consent.accept', undefined, { version: AI_DISCLOSURE_VERSION, requireZdr });
    });
  }
  async getConsent(identity: AIIdentity) {
    return (await this.pool.query<{ version: string; requireZdr: boolean }>('SELECT version,require_zdr AS "requireZdr" FROM ai_consents WHERE workspace_id=$1 AND user_id=$2', [identity.workspaceId, identity.userId])).rows[0] ?? null;
  }
  async withdrawConsent(identity: AIIdentity) {
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      await client.query('DELETE FROM ai_consents WHERE workspace_id=$1 AND user_id=$2', [identity.workspaceId, identity.userId]);
      await client.query('UPDATE ai_user_controls SET enabled=false WHERE workspace_id=$1 AND user_id=$2', [identity.workspaceId, identity.userId]);
      await this.audit(client, identity, 'ai.consent.withdraw');
    });
  }
  async configure(identity: AIIdentity, enabled: boolean) {
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      await client.query(`INSERT INTO ai_user_controls(workspace_id,user_id,enabled) VALUES($1,$2,$3)
        ON CONFLICT(workspace_id,user_id) DO UPDATE SET enabled=EXCLUDED.enabled`, [identity.workspaceId, identity.userId, enabled]);
      await this.audit(client, identity, 'ai.control.set', undefined, { enabled });
    });
  }
  async configureTenant(identity: AIIdentity, enabled: boolean) {
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      await client.query('INSERT INTO ai_tenant_controls(workspace_id,enabled) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET enabled=EXCLUDED.enabled', [identity.workspaceId, enabled]);
      await this.audit(client, identity, 'ai.tenant-control.set', undefined, { enabled });
    });
  }
  async assertEnabled(identity: AIIdentity, mode: AIKeyMode) {
    const result = await this.pool.query(`SELECT g.enabled AS global_enabled, t.enabled AS tenant_enabled, u.enabled, u.platform_enabled
      FROM ai_global_controls g LEFT JOIN ai_tenant_controls t ON t.workspace_id=$1 LEFT JOIN ai_user_controls u ON u.workspace_id=$1 AND u.user_id=$2 WHERE g.singleton=true`, [identity.workspaceId, identity.userId]);
    const row = result.rows[0]; if (!row?.global_enabled || !row.tenant_enabled || !row.enabled || (mode === 'platform' && !row.platform_enabled)) throw new AIError('DISABLED');
  }
  async minimumInput(identity: AIIdentity, contentId: string) {
    const content = await this.pool.query('SELECT 1 FROM ccos_contents WHERE workspace_id=$1 AND id=$2', [identity.workspaceId, contentId]);
    if (!content.rowCount) throw new AIError('INVALID_REQUEST');
    const result = await this.pool.query(`SELECT s.views,s.clicks,s.orders,s.conversion,s.classifications FROM ccos_performance_snapshots s
      WHERE s.workspace_id=$1 AND s.content_id=$2 AND observed_at<=now() ORDER BY observed_at DESC,id ASC LIMIT 1`, [identity.workspaceId, contentId]);
    const row = result.rows[0]; if (!row) throw new AIError('INVALID_REQUEST');
    const input: Record<string, number | null> = {};
    for (const field of ['views', 'clicks', 'orders', 'conversion']) {
      // Do not promote inferred or unavailable readings to observed inputs.
      const value = row[field]; input[field] = value === null || ['inferred', 'unavailable'].includes(row.classifications[field]) ? null : Number(value);
      if (input[field] !== null && (!Number.isFinite(input[field]) || input[field]! < 0)) throw new AIError('INVALID_REQUEST');
    }
    return input;
  }
  async reserve(identity: AIIdentity, input: AIReservationInput) {
    validateProvider(input.provider);
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      const existing = await client.query('SELECT 1 FROM ai_reservations WHERE id=$1', [input.id]);
      if (existing.rowCount) throw new AIError('INVALID_REQUEST'); // fail closed; replay never triggers a second paid call
      const controls = await client.query(`SELECT u.*,g.enabled AS global_enabled,t.enabled AS tenant_enabled FROM ai_user_controls u CROSS JOIN ai_global_controls g
        JOIN ai_tenant_controls t ON t.workspace_id=$1 WHERE u.workspace_id=$1 AND u.user_id=$2 AND g.singleton=true FOR SHARE OF g,t,u`, [identity.workspaceId, identity.userId]);
      const control = controls.rows[0]; if (!control?.global_enabled || !control.tenant_enabled || !control.enabled || (input.mode === 'platform' && !control.platform_enabled)) throw new AIError('DISABLED');
      const consent = await client.query('SELECT 1 FROM ai_consents WHERE workspace_id=$1 AND user_id=$2 AND version=$3', [identity.workspaceId, identity.userId, AI_DISCLOSURE_VERSION]);
      if (!consent.rowCount) throw new AIError('CONSENT_REQUIRED');
      const used = await client.query(`SELECT count(*) FILTER(WHERE status='pending' AND expires_at>now()) AS concurrent,
        COALESCE(sum(reserved_requests) FILTER(WHERE created_at>=date_trunc('day',now())),0) AS requests,
        COALESCE(sum(COALESCE(charged_tokens,reserved_tokens)) FILTER(WHERE created_at>=date_trunc('day',now())),0) AS tokens,
        COALESCE(sum(COALESCE(charged_usd,reserved_usd)) FILTER(WHERE created_at>=date_trunc('day',now())),0)::text AS spent
        FROM ai_reservations WHERE workspace_id=$1 AND user_id=$2`, [identity.workspaceId, identity.userId]);
      const usage = used.rows[0];
      const spend = await client.query('SELECT $1::numeric+$2::numeric>$3::numeric AS exceeded', [usage.spent, input.costUsd, control.daily_spend_usd]);
      if (Number(usage.concurrent) >= control.max_concurrent || Number(usage.requests) + input.requests > control.daily_requests
        || Number(usage.tokens) + input.tokens > Number(control.daily_tokens) || spend.rows[0].exceeded) throw new AIError('LIMIT_EXCEEDED');
      await client.query(`INSERT INTO ai_reservations(id,workspace_id,user_id,mode,provider,model,reserved_requests,reserved_tokens,reserved_usd,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '2 minutes')`, [input.id, identity.workspaceId, identity.userId, input.mode, input.provider, input.model, input.requests, input.tokens, input.costUsd]);
      await this.audit(client, identity, 'ai.request.reserve', input.id, { mode: input.mode, provider: input.provider, model: input.model });
    });
  }
  /** Commit of this one-shot lease is the dispatch linearization point. No connection survives this method. */
  async authorizeDispatch(identity: AIIdentity, input: AIDispatchInput): Promise<{ leaseId: string; key: string; requireZdr: boolean }> {
    validateProvider(input.provider);
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      const controls = await client.query(`SELECT g.enabled AS global_enabled,t.enabled AS tenant_enabled,u.enabled,u.platform_enabled
        FROM ai_global_controls g JOIN ai_tenant_controls t ON t.workspace_id=$1 JOIN ai_user_controls u ON u.workspace_id=$1 AND u.user_id=$2
        WHERE g.singleton=true FOR SHARE OF g,t,u`, [identity.workspaceId, identity.userId]);
      const control = controls.rows[0]; if (!control?.global_enabled || !control.tenant_enabled || !control.enabled || (input.mode === 'platform' && !control.platform_enabled)) throw new AIError('DISABLED');
      const consent = await client.query('SELECT version,require_zdr FROM ai_consents WHERE workspace_id=$1 AND user_id=$2 FOR SHARE', [identity.workspaceId, identity.userId]);
      if (consent.rows[0]?.version !== AI_DISCLOSURE_VERSION) throw new AIError('CONSENT_REQUIRED');
      const reservation = await client.query(`SELECT reserved_requests FROM ai_reservations WHERE workspace_id=$1 AND user_id=$2 AND id=$3
        AND mode=$4 AND provider=$5 AND model=$6 AND status='pending' AND expires_at>clock_timestamp() FOR UPDATE`,
      [identity.workspaceId, identity.userId, input.requestId, input.mode, input.provider, input.model]);
      if (!reservation.rowCount || !Number.isSafeInteger(input.attempt) || input.attempt < 1 || input.attempt > reservation.rows[0].reserved_requests) throw new AIError('INVALID_REQUEST');
      const prior = await client.query('SELECT count(*) AS attempts FROM ai_dispatch_leases WHERE request_id=$1', [input.requestId]);
      if (Number(prior.rows[0].attempts) !== input.attempt - 1) throw new AIError('INVALID_REQUEST');
      const key = await client.query(`SELECT id,revision,enabled,validated_at,expires_at<=clock_timestamp() AS expired,encrypted_key,encryption_version FROM ai_keys
        WHERE workspace_id=$1 AND user_id=$2 AND mode=$3 AND provider=$4 FOR SHARE`, [identity.workspaceId, identity.userId, input.mode, input.provider]);
      const current = key.rows[0]; if (!current || !current.enabled || current.id !== input.keyId || current.revision !== input.keyRevision) throw new AIError('KEY_DISABLED');
      if (!current.validated_at) throw new AIError('KEY_INVALID'); if (current.expired) throw new AIError('KEY_EXPIRED');
      let credential: string; try { credential = this.cipher.decrypt(current.encrypted_key, current.encryption_version, keyContext(identity, input.mode, input.provider)); } catch { throw new AIError('KEY_INVALID'); }
      const leaseId = randomUUID();
      await client.query(`INSERT INTO ai_dispatch_leases(id,workspace_id,user_id,request_id,attempt,provider,mode,key_id,key_revision,authorized_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())`, [leaseId, identity.workspaceId, identity.userId, input.requestId, input.attempt, input.provider, input.mode, current.id, current.revision]);
      await this.audit(client, identity, 'ai.request.authorize', leaseId);
      return { leaseId, key: credential, requireZdr: consent.rows[0].require_zdr };
    });
  }
  async finalize(identity: AIIdentity, input: AIFinalization) {
    return this.transaction(async (client) => {
      await this.lock(client, identity);
      const reserved = await client.query('SELECT * FROM ai_reservations WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE', [identity.workspaceId, identity.userId, input.id]);
      if (!reserved.rowCount || reserved.rows[0].mode !== input.mode || reserved.rows[0].model !== input.model || reserved.rows[0].provider !== input.provider) throw new AIError('INVALID_REQUEST');
      if (reserved.rows[0].status !== 'pending') return;
      const usage = input.result?.usage; const unknown = input.unknown || (usage !== undefined && usage.costUsd === null);
      const outcome = input.result && !input.errorCode ? 'succeeded' : unknown ? 'unknown' : 'failed';
      await client.query(`UPDATE ai_reservations SET status=$4,charged_tokens=$5,charged_usd=$6 WHERE workspace_id=$1 AND user_id=$2 AND id=$3`,
        [identity.workspaceId, identity.userId, input.id, outcome, unknown ? null : usage?.totalTokens ?? 0, unknown ? null : usage?.costUsd ?? '0']);
      await client.query(`INSERT INTO ai_usage_ledger(workspace_id,user_id,request_id,mode,provider,selected_model,resolved_model,resolved_provider,provider_request_id,prompt_version,schema_version,outcome,error_code,attempts,input_tokens,output_tokens,total_tokens,cost_usd,cost_source,finish_reason,latency_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [identity.workspaceId, identity.userId, input.id, input.mode, input.provider, input.model, input.result?.resolvedModel ?? null,
        input.result?.resolvedProvider ?? null, input.result?.providerRequestId ?? null, input.promptVersion, input.schemaVersion, outcome,
        input.errorCode ?? null, input.attempts, usage?.inputTokens ?? null, usage?.outputTokens ?? null, usage?.totalTokens ?? null,
        usage?.costUsd ?? null, usage?.costSource ?? 'unavailable', input.result?.finishReason ?? null, input.latencyMs]);
      await this.audit(client, identity, 'ai.request.finalize', input.id, { mode: input.mode, outcome, errorCode: input.errorCode ?? null });
    });
  }
  async ledger(identity: AIIdentity) {
    return (await this.pool.query('SELECT * FROM ai_usage_ledger WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100', [identity.workspaceId, identity.userId])).rows;
  }
}
