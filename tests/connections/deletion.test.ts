import { describe, it, expect } from 'vitest';
import {
  executeDeletion,
  DeletionConfig,
  DEFAULT_DELETION_CONFIG,
  DeletionResult,
} from '../../apps/api/src/lib/connection/deletion';

describe('Connection Deletion (#54)', () => {
  const defaultConfig: DeletionConfig = DEFAULT_DELETION_CONFIG;

  const mockStore = {
    connection: { id: 'conn-123', userId: 'user-456', accessToken: 'tok_123', refreshToken: 'ref_456' },
    deleteCredentialsCalled: false,
    cancelJobsCount: 0,
    findById: async function(id: string) {
      return id === this.connection?.id ? this.connection : null;
    },
    deleteCredentials: async function(id: string) {
      this.deleteCredentialsCalled = true;
    },
    cancelJobs: async function(id: string) {
      this.cancelJobsCount++;
      return 3;
    },
  };

  const mockAuditLogger = {
    events: [] as any[],
    log: async function(event: any) {
      this.events.push(event);
    },
  };

  it('deletes connection and produces completion record', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    // Provide a successful revocation function
    const revokeFn = async (_accessToken: string, _refreshToken: string) => ({ confirmed: true });
    const result = await executeDeletion('conn-123', defaultConfig, mockStore, mockAuditLogger, revokeFn);

    expect(result.connectionId).toBe('conn-123');
    expect(result.userId).toBe('user-456');
    expect(result.remoteRevocation).toBe('confirmed');
    expect(result.localCredentialsDeleted).toBe(true);
    expect(result.syncJobsCanceled).toBe(3);
    expect(result.cachesInvalidated).toBe(true);
    expect(result.completionRecordId).toContain('conn-123');
    expect(result.completedAt).toBeDefined();

    // Audit logged
    expect(mockAuditLogger.events).toHaveLength(1);
    expect(mockAuditLogger.events[0].action).toBe('connection.deletion');
    expect(mockAuditLogger.events[0].result).toBe('success');

    // Store methods called
    expect(mockStore.deleteCredentialsCalled).toBe(true);
    expect(mockStore.cancelJobsCount).toBe(1);
  });

  it('handles revocation unavailable gracefully', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const result = await executeDeletion(
      'conn-123',
      defaultConfig,
      mockStore,
      mockAuditLogger,
      async () => { throw new Error('revoke endpoint unavailable'); }
    );

    expect(result.remoteRevocation).toBe('unavailable');
    expect(result.localCredentialsDeleted).toBe(true);
    expect(result.completedAt).toBeDefined();
  });

  it('handles not_attempted revocation', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const result = await executeDeletion(
      'conn-123',
      defaultConfig,
      mockStore,
      mockAuditLogger,
      undefined
    );

    expect(result.remoteRevocation).toBe('not_attempted');
    expect(result.localCredentialsDeleted).toBe(true);
  });

  it('throws for nonexistent connection', async () => {
    const emptyStore = {
      ...mockStore,
      findById: async () => null,
    };

    await expect(
      executeDeletion('nonexistent', defaultConfig, emptyStore, mockAuditLogger)
    ).rejects.toThrow('Connection nonexistent not found');
  });
});
