/**
 * Role-based authorization.
 * 
 * Roles: owner, admin, analyst, viewer
 * Permissions are checked at the service layer, not just UI.
 */

export type Role = 'owner' | 'admin' | 'analyst' | 'viewer';

export type Permission =
  | 'read:own'
  | 'read:workspace'
  | 'write:own'
  | 'write:workspace'
  | 'delete:own'
  | 'delete:workspace'
  | 'admin:workspace'
  | 'admin:system';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    'read:own', 'read:workspace',
    'write:own', 'write:workspace',
    'delete:own', 'delete:workspace',
    'admin:workspace', 'admin:system',
  ],
  admin: [
    'read:own', 'read:workspace',
    'write:own', 'write:workspace',
    'delete:own', 'delete:workspace',
    'admin:workspace',
  ],
  analyst: [
    'read:own', 'read:workspace',
    'write:own',
  ],
  viewer: [
    'read:own', 'read:workspace',
  ],
};

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(
      `Role ${role} does not have permission ${permission}`
    );
  }
}

export function requireAnyPermission(role: Role, permissions: Permission[]): void {
  const hasAny = permissions.some(p => hasPermission(role, p));
  if (!hasAny) {
    throw new AuthorizationError(
      `Role ${role} does not have any of the required permissions: ${permissions.join(', ')}`
    );
  }
}
