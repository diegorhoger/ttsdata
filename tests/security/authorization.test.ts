import { describe, it, expect } from 'vitest';
import {
  Role,
  Permission,
  hasPermission,
  requirePermission,
  requireAnyPermission,
  AuthorizationError,
} from '../../packages/security/src/authorization';

describe('Authorization', () => {
  describe('hasPermission', () => {
    it('owner has all permissions', () => {
      const allPerms: Permission[] = [
        'read:own', 'read:workspace', 'write:own', 'write:workspace',
        'delete:own', 'delete:workspace', 'admin:workspace', 'admin:system',
      ];
      for (const p of allPerms) {
        expect(hasPermission('owner', p)).toBe(true);
      }
    });

    it('admin has workspace admin but not system admin', () => {
      expect(hasPermission('admin', 'admin:workspace')).toBe(true);
      expect(hasPermission('admin', 'admin:system')).toBe(false);
    });

    it('analyst can read and write own but not delete', () => {
      expect(hasPermission('analyst', 'read:workspace')).toBe(true);
      expect(hasPermission('analyst', 'write:own')).toBe(true);
      expect(hasPermission('analyst', 'delete:own')).toBe(false);
    });

    it('viewer can only read', () => {
      expect(hasPermission('viewer', 'read:own')).toBe(true);
      expect(hasPermission('viewer', 'read:workspace')).toBe(true);
      expect(hasPermission('viewer', 'write:own')).toBe(false);
      expect(hasPermission('viewer', 'delete:own')).toBe(false);
    });
  });

  describe('requirePermission', () => {
    it('does not throw when permission exists', () => {
      expect(() => requirePermission('owner', 'admin:system')).not.toThrow();
    });

    it('throws when permission missing', () => {
      expect(() => requirePermission('viewer', 'admin:system')).toThrow(AuthorizationError);
    });
  });

  describe('requireAnyPermission', () => {
    it('passes when any permission exists', () => {
      expect(() => requireAnyPermission('analyst', ['delete:own', 'write:own'])).not.toThrow();
    });

    it('fails when no permissions exist', () => {
      expect(() => requireAnyPermission('viewer', ['delete:own', 'admin:workspace'])).toThrow(AuthorizationError);
    });
  });
});
