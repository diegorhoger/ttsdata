/**
 * Session-based authentication & tenant boundary enforcement
 *
 * Sessions are resolved with an explicit join rather than Drizzle's relational
 * `db.query.*` + `with:` API. That API requires `relations()` metadata, which
 * this schema does not define — using it made every authenticated request throw
 * `TypeError: Cannot read properties of undefined (reading 'referencedTable')`
 * inside `normalizeRelation`. An explicit join needs no relationship layer and
 * keeps the same authoritative user/workspace identity.
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, sessions, workspaces } from '@ttsdata/db/src/schema';
import { AppError } from './errors';

export interface AuthContext {
  userId: string;
  workspaceId: string;
  email: string;
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
  planCode: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

/**
 * PreHandler: require a valid session.
 *
 * Fails closed with 401 for a missing, unknown, or expired session. A present
 * but unusable session must never surface as a 500.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.session;

  if (!token) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const rows = await db
    .select({
      expiresAt: sessions.expiresAt,
      userId: users.id,
      workspaceId: users.workspaceId,
      email: users.email,
      role: users.role,
      planCode: workspaces.planCode,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(workspaces, eq(workspaces.id, users.workspaceId))
    .where(eq(sessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
  }
  if (row.expiresAt < new Date()) {
    throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
  }

  request.auth = {
    userId: row.userId,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    planCode: row.planCode,
  };
}

/**
 * PreHandler: require specific roles
 */
export function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    if (!roles.includes(request.auth.role)) {
      throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
    }
  };
}

