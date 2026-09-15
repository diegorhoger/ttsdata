import { describe, it, expect } from 'vitest';
import {
  TenantContext,
  TenantIsolationError,
  assertTenantAccess,
  createTenantScopedRepository,
} from '../../packages/security/src/tenant';

describe('Tenant Isolation', () => {
  const context: TenantContext = {
    workspaceId: 'ws-123',
    userId: 'user-456',
    roles: ['owner'],
  };

  describe('assertTenantAccess', () => {
    it('allows access to same workspace', () => {
      expect(() => assertTenantAccess(context, 'ws-123')).not.toThrow();
    });

    it('denies access to different workspace', () => {
      expect(() => assertTenantAccess(context, 'ws-999')).toThrow(TenantIsolationError);
    });

    it('includes workspace IDs in error message', () => {
      try {
        assertTenantAccess(context, 'ws-999');
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(TenantIsolationError);
        expect((err as Error).message).toContain('ws-123');
        expect((err as Error).message).toContain('ws-999');
      }
    });
  });

  describe('createTenantScopedRepository', () => {
    it('returns entity when workspace matches', async () => {
      const repo = {
        findById: async (id: string) => ({ id, workspaceId: 'ws-123', name: 'Test' }),
      };
      const scoped = createTenantScopedRepository(context, repo);
      const result = await scoped.findById('entity-1');
      expect(result).toEqual({ id: 'entity-1', workspaceId: 'ws-123', name: 'Test' });
    });

    it('throws when entity belongs to different workspace', async () => {
      const repo = {
        findById: async (id: string) => ({ id, workspaceId: 'ws-999', name: 'Test' }),
      };
      const scoped = createTenantScopedRepository(context, repo);
      await expect(scoped.findById('entity-1')).rejects.toThrow(TenantIsolationError);
    });

    it('returns null when entity not found', async () => {
      const repo = {
        findById: async (id: string) => null,
      };
      const scoped = createTenantScopedRepository(context, repo);
      const result = await scoped.findById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
