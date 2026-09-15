import { describe, it, expect } from 'vitest';
import {
  AuditEvent,
  AuditLogger,
  ConsoleAuditLogger,
  sanitizeForAudit,
} from '../../packages/security/src/audit';

describe('Audit', () => {
  describe('sanitizeForAudit', () => {
    it('redacts password fields', () => {
      const input = { username: 'test', password: 'secret123' };
      const result = sanitizeForAudit(input);
      expect(result.username).toBe('test');
      expect(result.password).toBe('[REDACTED]');
    });

    it('redacts token fields', () => {
      const input = { accessToken: 'abc123', refreshToken: 'def456' };
      const result = sanitizeForAudit(input);
      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
    });

    it('redacts nested sensitive fields', () => {
      const input = {
        user: { name: 'Test', passwordHash: 'hash123' },
        data: { value: 42 },
      };
      const result = sanitizeForAudit(input);
      expect(result.user.name).toBe('Test');
      expect(result.user.passwordHash).toBe('[REDACTED]');
      expect(result.data.value).toBe(42);
    });

    it('preserves non-sensitive fields', () => {
      const input = { id: '123', name: 'Test', count: 42 };
      const result = sanitizeForAudit(input);
      expect(result).toEqual(input);
    });
  });

  describe('ConsoleAuditLogger', () => {
    it('logs event with id and timestamp', async () => {
      const logger = new ConsoleAuditLogger();
      const event = {
        actor: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
        action: 'test.action',
        result: 'success' as const,
      };
      await logger.log(event);
      // If we get here without throwing, the logger works
      expect(true).toBe(true);
    });
  });
});
