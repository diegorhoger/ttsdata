/**
 * Session-based authentication & tenant boundary enforcement
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
 * PreHandler: require a valid session
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies?.session;
  
  if (!token) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const result = (await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
    with: {
      user: {
        with: {
          workspace: true,
        },
      },
    },
  })) as any;

  if (!result || result.expiresAt < new Date()) {
    throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
  }

  request.auth = {
    userId: result.user.id,
    workspaceId: result.user.workspaceId,
    email: result.user.email,
    role: result.user.role,
    planCode: result.user.workspace.planCode,
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
