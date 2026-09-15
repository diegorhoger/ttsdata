/**
 * Tenant isolation primitives.
 * 
 * All data access must be scoped to a workspace/tenant. Cross-tenant access
 * must fail closed by default.
 */

export interface TenantContext {
  workspaceId: string;
  userId: string;
  roles: string[];
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Assert that the current context belongs to the expected workspace.
 * Throws TenantIsolationError if not.
 */
export function assertTenantAccess(
  context: TenantContext,
  targetWorkspaceId: string
): void {
  if (context.workspaceId !== targetWorkspaceId) {
    throw new TenantIsolationError(
      `Cross-tenant access denied: context workspace ${context.workspaceId} != target ${targetWorkspaceId}`
    );
  }
}

/**
 * Create a tenant-scoped repository wrapper that enforces isolation.
 */
export function createTenantScopedRepository<T extends { workspaceId: string }>(
  context: TenantContext,
  repository: { findById: (id: string) => Promise<T | null> }
) {
  return {
    async findById(id: string): Promise<T | null> {
      const entity = await repository.findById(id);
      if (entity && entity.workspaceId !== context.workspaceId) {
        throw new TenantIsolationError(
          `Entity ${id} belongs to workspace ${entity.workspaceId}, not ${context.workspaceId}`
        );
      }
      return entity;
    },
  };
}
