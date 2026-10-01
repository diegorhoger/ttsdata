import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { buildDashboard, type DashboardDomain } from '../../src/ccos/dashboard';
import { CCOSDashboardRepository } from '../../src/repositories/dashboard';

const now = new Date('2026-10-01T12:00:00Z');
const empty = (): DashboardDomain => ({ stores: [], partnerships: [], products: [], contents: [], nextActions: [], performance: [], interactions: [] });

describe('canonical dashboard projection', () => {
  it('returns honest zero counts without fabricated performance or work', () => {
    const dashboard = buildDashboard(empty(), now);
    expect(Object.values(dashboard.counts).every((value) => value === 0)).toBe(true);
    expect(dashboard.attention).toEqual([]);
  });

  it('resolves every polymorphic attention source to its partnership; excludes resolved work', () => {
    const domain = empty();
    domain.partnerships = [
      { id: 'p', storeId: 's', status: 'active' }, { id: 'p2', storeId: 's2', status: 'paused' },
      { id: 'done', storeId: 's', status: 'completed' },
    ] as DashboardDomain['partnerships'];
    domain.products = [{ id: 'product', partnershipId: 'p', status: 'received' }] as DashboardDomain['products'];
    domain.contents = [{ id: 'content', productId: 'product', status: 'ready' }] as DashboardDomain['contents'];
    domain.interactions = [{ id: 'interaction', partnershipId: 'p', sources: [] }] as DashboardDomain['interactions'];
    domain.nextActions = ['partnership', 'product', 'content', 'interaction', 'store'].map((type, i) => ({
      id: String(i), title: 'Follow up', ruleKey: null, target: { type, id: ['p', 'product', 'content', 'interaction', 's'][i] },
      status: 'open', dueAt: new Date(now.getTime() - 1), waitingReason: null,
    })) as DashboardDomain['nextActions'];
    domain.nextActions.push({ ...domain.nextActions[0], id: 'waiting', status: 'waiting', waitingReason: 'Awaiting sample' },
      { ...domain.nextActions[0], id: 'done', status: 'completed' });
    const dashboard = buildDashboard(domain, now);
    expect(dashboard.attention).toHaveLength(6);
    expect(dashboard.attention.every((item) => item.partnershipIds.includes('p'))).toBe(true);
    expect(dashboard.counts.overdueReplies).toBe(5);
    expect(dashboard.counts.receivedProducts).toBe(1);
    expect(dashboard.counts.awaitingPublication).toBe(1);
    expect(dashboard.activePartnerships).toHaveLength(2);
    expect(dashboard.activePartnerships[0].waitingReason).toBe('Awaiting sample');
    expect(dashboard.activePartnerships[1].waitingReason).toContain('No next action');
  });

  it('does not call all overdue work replies and flags unavailable or expired authorization', () => {
    const domain = empty();
    domain.nextActions = [{ id: 'a', status: 'open', title: 'Film content', ruleKey: null,
      target: { type: 'content', id: 'c' }, dueAt: new Date(now.getTime() - 1) }] as DashboardDomain['nextActions'];
    domain.contents = [
      { id: 'a', status: 'published', adAuthorizationStatus: 'unavailable', adAuthorizationCode: null, adAuthorizationExpiresAt: null },
      { id: 'b', status: 'monitoring', adAuthorizationStatus: 'authorized', adAuthorizationCode: 'code', adAuthorizationExpiresAt: now },
      { id: 'c', status: 'published', adAuthorizationStatus: 'authorized', adAuthorizationCode: 'code', adAuthorizationExpiresAt: new Date(now.getTime() + 1) },
    ] as DashboardDomain['contents'];
    const dashboard = buildDashboard(domain, now);
    expect(dashboard.counts.overdueActions).toBe(1);
    expect(dashboard.counts.overdueReplies).toBe(0);
    expect(dashboard.sections.awaitingAdAuthorization.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('dashboard snapshot ownership', () => {
  it('rolls back and releases a failed read without querying the pool outside its snapshot', async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ as_of: now }] }).mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue({ rows: [] }), release: vi.fn() };
    const pool = { connect: vi.fn().mockResolvedValue(client), query: vi.fn() };
    await expect(new CCOSDashboardRepository(pool as unknown as Pool).getDashboard('workspace')).rejects.toThrow('read failed');
    expect(client.query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    expect(client.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
