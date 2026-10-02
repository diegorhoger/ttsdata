import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { AIRepository, type AIIdentity } from '../../src/repositories/ai';
import { AIKeyCipher } from '../../src/ai-crypto';
import { AI_DISCLOSURE_VERSION, FakeAIProvider } from '../../../shared/src/ai';
import { CCOSRepository } from '../../src/repositories/ccos';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test')) throw new Error('AI integration tests require TEST_DATABASE_URL ending in _test');
const cipher = new AIKeyCipher({ 1: Buffer.alloc(32, 7).toString('base64') }, 1);
describe('AI control plane on PostgreSQL', () => {
  const pool = new Pool({ connectionString: url }); const repository = new AIRepository(pool, cipher); let workspaceA: string; let workspaceB: string; let globalEnabled: boolean;
  beforeAll(async () => {
    globalEnabled = (await pool.query('SELECT enabled FROM ai_global_controls WHERE singleton=true')).rows[0].enabled;
    await pool.query('UPDATE ai_global_controls SET enabled=true WHERE singleton=true');
    const result = await pool.query("INSERT INTO workspaces(name) VALUES('AI A'),('AI B') RETURNING id"); [workspaceA, workspaceB] = result.rows.map((item) => item.id);
  });
  afterAll(async () => {
    const ids = [workspaceA, workspaceB].filter(Boolean);
    await pool.query('DELETE FROM users WHERE workspace_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM workspaces WHERE id=ANY($1::uuid[])', [ids]);
    if (globalEnabled !== undefined) await pool.query('UPDATE ai_global_controls SET enabled=$1 WHERE singleton=true', [globalEnabled]);
    await pool.end();
  });
  async function user(workspaceId = workspaceA): Promise<AIIdentity> {
    const result = await pool.query('INSERT INTO users(workspace_id,email,password_hash) VALUES($1,$2,$3) RETURNING id', [workspaceId, `${randomUUID()}@ai.test`, 'test-only-hash']);
    const identity = { workspaceId, userId: result.rows[0].id };
    await repository.configureTenant(identity, true); await repository.configure(identity, true); await repository.consent(identity, true);
    return identity;
  }
  const reservation = (overrides: object = {}) => ({ id: randomUUID(), mode: 'byok' as const, provider: 'fake', model: 'fake/summary', requests: 1, tokens: 100, costUsd: '0.1', ...overrides });
  const finalization = (id: string) => ({ id, mode: 'byok' as const, model: 'fake/summary', provider: 'fake', promptVersion: 'v1', schemaVersion: 'v1', attempts: 0, latencyMs: 0, unknown: false, errorCode: 'DISABLED' });

  it('encrypts, masks, isolates by user and tenant, rotates and immediately deletes key material', async () => {
    const a = await user(); const sameTenant = await user(); const other = await user(workspaceB); const raw = 'sk-or-test-private-key-123456';
    const first = await repository.putKey(a, 'byok', 'openrouter', raw, true);
    expect(first.fingerprint).not.toContain(raw); expect(JSON.stringify(first)).not.toContain(raw);
    const stored = (await pool.query('SELECT encrypted_key FROM ai_keys WHERE id=$1', [first.id])).rows[0]; expect(stored.encrypted_key).not.toContain(raw);
    expect((await repository.credential(a, 'byok', 'openrouter')).key).toBe(raw);
    await expect(repository.credential(sameTenant, 'byok', 'openrouter')).rejects.toMatchObject({ code: 'KEY_MISSING' });
    await expect(repository.credential(other, 'byok', 'openrouter')).rejects.toMatchObject({ code: 'KEY_MISSING' });
    await expect(repository.putKey({ workspaceId: workspaceB, userId: a.userId }, 'byok', 'openrouter', raw, true)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    const rotated = await repository.putKey(a, 'byok', 'openrouter', 'sk-or-rotated-private-key-98765', true); expect(rotated.revision).toBe(first.revision + 1);
    await repository.changeKey(a, 'byok', 'openrouter', 'disable'); await expect(repository.credential(a, 'byok', 'openrouter')).rejects.toMatchObject({ code: 'KEY_DISABLED' });
    await repository.changeKey(a, 'byok', 'openrouter', 'delete'); expect((await pool.query('SELECT 1 FROM ai_keys WHERE id=$1', [first.id])).rowCount).toBe(0);
    const audit = (await pool.query('SELECT * FROM ai_audit WHERE workspace_id=$1 AND user_id=$2', [a.workspaceId, a.userId])).rows;
    expect(audit.map((item) => item.action)).toContain('ai.key.delete'); expect(JSON.stringify(audit)).not.toContain(raw);
  });
  it('rejects never-validated and expired credentials; platform attribution is independent', async () => {
    const a = await user(); await repository.putKey(a, 'byok', 'openrouter', 'private-unvalidated-key-123456', false);
    await expect(repository.credential(a, 'byok', 'openrouter')).rejects.toMatchObject({ code: 'KEY_INVALID' });
    await repository.putKey(a, 'byok', 'openrouter', 'private-expired-key-123456', true, new Date(Date.now() - 1));
    await expect(repository.credential(a, 'byok', 'openrouter')).rejects.toMatchObject({ code: 'KEY_EXPIRED' });
    await repository.putKey(a, 'platform', 'openrouter', 'private-platform-key-123456', true);
    expect((await repository.credential(a, 'platform', 'openrouter')).key).toBe('private-platform-key-123456');
    await expect(repository.assertEnabled(a, 'platform')).rejects.toMatchObject({ code: 'DISABLED' });
    await pool.query('UPDATE ai_user_controls SET platform_enabled=true WHERE workspace_id=$1 AND user_id=$2', [a.workspaceId, a.userId]);
    await expect(repository.assertEnabled(a, 'platform')).resolves.toBeUndefined();
    const request = reservation({ mode: 'platform' }); await repository.reserve(a, request); await repository.finalize(a, { ...finalization(request.id), mode: 'platform' });
    expect((await repository.ledger(a))[0].mode).toBe('platform');
  });
  it('serializes concurrency reservations across independent connections and isolates other users', async () => {
    const a = await user(); await pool.query('UPDATE ai_user_controls SET max_concurrent=1 WHERE workspace_id=$1 AND user_id=$2', [a.workspaceId, a.userId]);
    const results = await Promise.allSettled([repository.reserve(a, reservation()), repository.reserve(a, reservation())]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((item) => item.status === 'rejected') as PromiseRejectedResult).reason.code).toBe('LIMIT_EXCEEDED');
    await expect(repository.reserve(await user(), reservation())).resolves.toBeUndefined();
  });
  it('serializes spend races with exact decimal arithmetic', async () => {
    const a = await user(); await pool.query('UPDATE ai_user_controls SET max_concurrent=10,daily_spend_usd=0.5 WHERE workspace_id=$1 AND user_id=$2', [a.workspaceId, a.userId]);
    const results = await Promise.allSettled([repository.reserve(a, reservation({ costUsd: '0.4' })), repository.reserve(a, reservation({ costUsd: '0.4' }))]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  });
  it('enforces request/token limits and all three kill switches', async () => {
    const a = await user(); await pool.query('UPDATE ai_user_controls SET daily_requests=1,daily_tokens=100 WHERE workspace_id=$1 AND user_id=$2', [a.workspaceId, a.userId]);
    await expect(repository.reserve(a, reservation({ requests: 2 }))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await expect(repository.reserve(a, reservation({ tokens: 101 }))).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    await repository.configure(a, false); await expect(repository.reserve(a, reservation())).rejects.toMatchObject({ code: 'DISABLED' });
    await repository.configure(a, true); await repository.configureTenant(a, false); await expect(repository.assertEnabled(a, 'byok')).rejects.toMatchObject({ code: 'DISABLED' });
    await repository.configureTenant(a, true); await pool.query('UPDATE ai_global_controls SET enabled=false WHERE singleton=true');
    await expect(repository.assertEnabled(a, 'byok')).rejects.toMatchObject({ code: 'DISABLED' }); await pool.query('UPDATE ai_global_controls SET enabled=true WHERE singleton=true');
  });
  it('keeps unknown cost null/conservative, releases known precharge failures and finalizes idempotently', async () => {
    const a = await user(); const known = reservation(); await repository.reserve(a, known);
    await repository.finalize(a, finalization(known.id)); await repository.finalize(a, finalization(known.id));
    let ledger = await repository.ledger(a); expect(ledger).toHaveLength(1); expect(ledger[0]).toMatchObject({ outcome: 'failed', cost_usd: null, cost_source: 'unavailable' });
    const released = (await pool.query('SELECT charged_tokens,charged_usd FROM ai_reservations WHERE id=$1', [known.id])).rows[0]; expect(Number(released.charged_tokens)).toBe(0); expect(Number(released.charged_usd)).toBe(0);
    const unknown = reservation(); await repository.reserve(a, unknown); await repository.finalize(a, { ...finalization(unknown.id), unknown: true, attempts: 1, errorCode: 'TIMEOUT' });
    const conserved = (await pool.query('SELECT status,charged_usd,reserved_usd FROM ai_reservations WHERE id=$1', [unknown.id])).rows[0]; expect(conserved.status).toBe('unknown'); expect(conserved.charged_usd).toBeNull(); expect(Number(conserved.reserved_usd)).toBe(0.1);
    await expect(repository.reserve(a, known)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(pool.query('UPDATE ai_usage_ledger SET cost_usd=0 WHERE request_id=$1', [known.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query('DELETE FROM ai_usage_ledger WHERE request_id=$1', [known.id])).rejects.toMatchObject({ code: '23514' });
    expect(await repository.ledger(await user(workspaceB))).toEqual([]);
  });
  it('only projects minimum authorized numeric fields, not IDs/secrets/unrelated content', async () => {
    const a = await user(); const domain = new CCOSRepository(pool); const brand = await domain.createStore({ workspaceId: workspaceA, name: 'Private account' });
    const partnership = await domain.createPartnership({ workspaceId: workspaceA, storeId: brand.id, type: 'gifting' });
    const product = await domain.createProduct({ workspaceId: workspaceA, partnershipId: partnership.id, name: 'Private product' });
    const content = await domain.createContent({ workspaceId: workspaceA, productId: product.id, platform: 'manual', concept: 'private email not sent' });
    await domain.createPerformanceSnapshot({ workspaceId: workspaceA, contentId: content.id, observedAt: new Date(Date.now() - 1000), source: 'manual', metrics: {
      views: { value: 100, classification: 'observed' }, orders: { value: 3, classification: 'inferred' },
    } });
    expect(await repository.minimumInput(a, content.id)).toEqual({ views: 100, clicks: null, orders: null, conversion: null });
    await expect(repository.minimumInput(await user(workspaceB), content.id)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect((await repository.getConsent(a))?.version).toBe(AI_DISCLOSURE_VERSION);
  });
  it('reconciles successful provider usage and permits deliberate account deletion cascade', async () => {
    const a = await user(); const request = reservation(); await repository.reserve(a, request);
    const result = await new FakeAIProvider().generate({ correlationId: request.id, model: 'fake/summary', promptVersion: 'v1', schemaVersion: 'v1', schema: { type: 'object' }, instruction: 'none', input: {}, maxOutputTokens: 64, requireZdr: true, signal: new AbortController().signal });
    await repository.finalize(a, { ...finalization(request.id), errorCode: undefined, attempts: 1, result });
    const ledger = (await repository.ledger(a))[0]; expect(Number(ledger.total_tokens)).toBe(40); expect(Number(ledger.cost_usd)).toBe(0); expect(ledger.outcome).toBe('succeeded'); expect(ledger.provider_request_id).toBe(request.id);
    expect(JSON.stringify(ledger)).not.toContain('Recorded metrics reviewed');
    await pool.query('DELETE FROM users WHERE id=$1 AND workspace_id=$2', [a.userId, a.workspaceId]);
    expect((await pool.query('SELECT 1 FROM ai_usage_ledger WHERE user_id=$1', [a.userId])).rowCount).toBe(0);
  });
  async function dispatchFixture() {
    const a = await user(); const key = await repository.putKey(a, 'byok', 'fake', 'fake-key-for-dispatch-123456', true);
    const request = reservation({ requests: 3 }); await repository.reserve(a, request);
    const authorization = { requestId: request.id, attempt: 1, mode: 'byok' as const, model: request.model, provider: 'fake', keyId: key.id, keyRevision: key.revision };
    return { a, key, request, authorization };
  }
  it.each(['disable', 'delete'] as const)('revocation %s before the dispatch authorization commit blocks every future lease', async (operation) => {
    const fixture = await dispatchFixture(); const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ai:${fixture.a.workspaceId}:${fixture.a.userId}`]);
      // Both operations queue behind the held identity lock, in the explicit order observed by the backend.
      const revocation = repository.changeKey(fixture.a, 'byok', 'fake', operation);
      await waitForLockWaiters(fixture.a, 1);
      const authorization = repository.authorizeDispatch(fixture.a, fixture.authorization).then((value) => ({ value }), (error) => ({ error }));
      await waitForLockWaiters(fixture.a, 2);
      await blocker.query('COMMIT'); await revocation;
      const result = await authorization; expect('error' in result && result.error.code).toBe('KEY_DISABLED');
      expect((await pool.query('SELECT 1 FROM ai_dispatch_leases WHERE request_id=$1', [fixture.request.id])).rowCount).toBe(0);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
    }
  });
  async function waitForLockWaiters(identity: AIIdentity, minimum: number) {
    // Bounded read-only polling observes actual PostgreSQL lock queues, rather than relying on sleeps for interleaving.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const result = await pool.query(`SELECT count(*)::int AS count FROM pg_locks
        WHERE locktype='advisory' AND NOT granted AND (classid::bigint << 32 | objid::bigint) = hashtextextended($1,0)`, [`ai:${identity.workspaceId}:${identity.userId}`]);
      if (result.rows[0].count >= minimum) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Expected AI authorization/revocation lock waiters');
  }
  it('an authorization committed before revocation is the only permitted in-flight case; retry/replay is blocked', async () => {
    const fixture = await dispatchFixture(); const lease = await repository.authorizeDispatch(fixture.a, fixture.authorization);
    expect(lease.key).toBe('fake-key-for-dispatch-123456');
    await repository.changeKey(fixture.a, 'byok', 'fake', 'disable');
    // The lease's credential was returned only after its transaction committed and released its connection.
    expect((await pool.query('SELECT key_revision FROM ai_dispatch_leases WHERE id=$1', [lease.leaseId])).rows[0].key_revision).toBe(fixture.key.revision);
    await expect(repository.authorizeDispatch(fixture.a, { ...fixture.authorization, attempt: 2 })).rejects.toMatchObject({ code: 'KEY_DISABLED' });
    await expect(repository.authorizeDispatch(fixture.a, fixture.authorization)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(pool.query('DELETE FROM ai_dispatch_leases WHERE id=$1', [lease.leaseId])).rejects.toMatchObject({ code: '23514' });
  });
  it.each(['user', 'tenant', 'global'] as const)('control-off %s after preparation but before authorization blocks the attempt', async (control) => {
    const fixture = await dispatchFixture();
    if (control === 'user') await repository.configure(fixture.a, false);
    if (control === 'tenant') await repository.configureTenant(fixture.a, false);
    if (control === 'global') await pool.query('UPDATE ai_global_controls SET enabled=false WHERE singleton=true');
    try { await expect(repository.authorizeDispatch(fixture.a, fixture.authorization)).rejects.toMatchObject({ code: 'DISABLED' }); }
    finally { if (control === 'global') await pool.query('UPDATE ai_global_controls SET enabled=true WHERE singleton=true'); }
  });
  it('consent withdrawal atomically disables the user, erases consent, and audits no metadata', async () => {
    const fixture = await dispatchFixture(); await repository.withdrawConsent(fixture.a);
    expect(await repository.getConsent(fixture.a)).toBeNull();
    await expect(repository.authorizeDispatch(fixture.a, fixture.authorization)).rejects.toMatchObject({ code: 'DISABLED' });
    await repository.configure(fixture.a, true);
    await expect(repository.authorizeDispatch(fixture.a, fixture.authorization)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    const audit = (await pool.query("SELECT metadata,target_id FROM ai_audit WHERE workspace_id=$1 AND user_id=$2 AND action='ai.consent.withdraw'", [fixture.a.workspaceId, fixture.a.userId])).rows[0];
    expect(audit).toEqual({ metadata: {}, target_id: null });
  });
  it('provider-neutral identities coexist, and provider-bound AAD rejects ciphertext swapped across providers', async () => {
    const a = await user(); const first = await repository.putKey(a, 'byok', 'future_provider', 'future-provider-private-key-123456', true);
    const second = await repository.putKey(a, 'byok', 'another_provider', 'another-provider-private-key-123456', true);
    expect(first.id).not.toBe(second.id); expect((await repository.listKeys(a)).map((key) => key.provider).sort()).toEqual(['another_provider', 'future_provider']);
    expect((await repository.credential(a, 'byok', 'future_provider')).key).toBe('future-provider-private-key-123456');
    await pool.query('UPDATE ai_keys SET encrypted_key=(SELECT encrypted_key FROM ai_keys WHERE id=$1) WHERE id=$2', [first.id, second.id]);
    await expect(repository.credential(a, 'byok', 'another_provider')).rejects.toMatchObject({ code: 'KEY_INVALID' });
    await repository.changeKey(a, 'byok', 'future_provider', 'disable');
    expect((await repository.listKeys(a)).find((key) => key.id === second.id)?.enabled).toBe(true);
  });
});
