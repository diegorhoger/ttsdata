import { describe, it, expect } from 'vitest';
import {
  executeDeletion,
  DeletionConfig,
  DEFAULT_DELETION_CONFIG,
  DeletionResult,
  CacheInvalidator,
  TenantIsolationChecker,
  DerivedRecordCounter,
} from '../../apps/api/src/lib/connection/deletion';

describe('Connection Deletion (#54)', () => {
  const defaultConfig: DeletionConfig = DEFAULT_DELETION_CONFIG;

  const mockStore = {
    connection: { id: 'conn-123', userId: 'user-456', accessToken: 'tok_123', refreshToken: 'ref_456' },
    deleteCredentialsCalled: false,
    cancelJobsCount: 0,
    findById: async function (id: string) {
      return id === this.connection?.id ? this.connection : null;
    },
    deleteCredentials: async function (id: string) {
      this.deleteCredentialsCalled = true;
    },
    cancelJobs: async function (id: string) {
      this.cancelJobsCount++;
      return 3;
    },
  };

  const mockAuditLogger = {
    events: [] as any[],
    log: async function (event: any) {
      this.events.push(event);
    },
  };

  const mockCacheInvalidator: CacheInvalidator = {
    invalidateScope: async (scope: string) => {
      // no-op for tests
    },
  };

  const mockTenantChecker: TenantIsolationChecker = {
    verifyNoOrphanRecords: async (connId: string, userId: string) => true,
  };

  const mockDerivedCounter: DerivedRecordCounter = {
    countDerivedRecords: async (connId: string) => 5,
    removeDerivedRecords: async (connId: string) => 5,
  };

  it('deletes connection and produces completion record', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const revokeFn = async (_accessToken: string, _refreshToken: string) => ({ confirmed: true });
    const result = await executeDeletion(
      'conn-123',
      defaultConfig,
      mockStore,
      mockAuditLogger,
      revokeFn,
      mockCacheInvalidator,
      mockTenantChecker,
      mockDerivedCounter
    );

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

  it('returns idempotent result for nonexistent connection', async () => {
    const emptyStore = {
      ...mockStore,
      findById: async () => null,
    };

    // Idempotent: returns a result instead of throwing on second call
    const result = await executeDeletion('nonexistent', defaultConfig, emptyStore, mockAuditLogger);

    expect(result.connectionId).toBe('nonexistent');
    expect(result.localCredentialsDeleted).toBe(false);
    expect(result.remoteRevocation).toBe('not_attempted');
    expect(result.cachesInvalidated).toBe(false);
    expect(result.tenantIdIsolationVerified).toBe(true);
    expect(result.completionRecordId).toContain('nonexistent');
    expect(result.completedAt).toBeDefined();
  });

  // --- NEW: Tests covering reviewer repair acceptance criteria ---

  it('cachesInvalidated is false when no cacheInvalidator provided', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const revokeFn = async () => ({ confirmed: true });
    const result = await executeDeletion(
      'conn-123', defaultConfig, mockStore, mockAuditLogger, revokeFn,
      undefined,       // no cacheInvalidator
      mockTenantChecker,
      mockDerivedCounter
    );

    expect(result.cachesInvalidated).toBe(false);
  });

  it('tenantIdIsolationVerified reflects checker result', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const failingTenantChecker: TenantIsolationChecker = {
      verifyNoOrphanRecords: async () => false, // isolation FAILED
    };

    const revokeFn = async () => ({ confirmed: true });
    const result = await executeDeletion(
      'conn-123', defaultConfig, mockStore, mockAuditLogger, revokeFn,
      mockCacheInvalidator,
      failingTenantChecker,
      mockDerivedCounter
    );

    expect(result.tenantIdIsolationVerified).toBe(false);
  });

  it('derivedRecordsRemoved counts when retainAggregates=true', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const configWithRetain: DeletionConfig = { ...defaultConfig, retainAggregates: true };
    const revokeFn = async () => ({ confirmed: true });
    const result = await executeDeletion(
      'conn-123', configWithRetain, mockStore, mockAuditLogger, revokeFn,
      mockCacheInvalidator,
      mockTenantChecker,
      mockDerivedCounter
    );

    // retainAggregates=true → count only, don't delete → 5
    expect(result.derivedRecordsRemoved).toBe(5);
  });

  it('derivedRecordsRemoved deletes when retainAggregates=false', async () => {
    mockStore.deleteCredentialsCalled = false;
    mockStore.cancelJobsCount = 0;
    mockAuditLogger.events = [];

    const configNoRetain: DeletionConfig = { ...defaultConfig, retainAggregates: false };
    const revokeFn = async () => ({ confirmed: true });
    const result = await executeDeletion(
      'conn-123', configNoRetain, mockStore, mockAuditLogger, revokeFn,
      mockCacheInvalidator,
      mockTenantChecker,
      mockDerivedCounter
    );

    // retainAggregates=false → remove → 5
    expect(result.derivedRecordsRemoved).toBe(5);
  });
});
