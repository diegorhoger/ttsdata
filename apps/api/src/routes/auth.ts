/**
 * Authentication routes - register, login, logout, session
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../lib/db';
import { users, sessions, workspaces } from '@ttsdata/db/src/schema';
import { AppError } from '../lib/errors';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function registerAuthRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    // Check existing user
    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });

    if (existing) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(body.password, 12);

    // Create workspace + user in transaction
    const result = await db.transaction(async (tx: any) => {
      const [workspace] = await tx.insert(workspaces).values({
        name: body.displayName || 'My Workspace',
      }).returning();

      const [user] = await tx.insert(users).values({
        workspaceId: workspace.id,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: 'owner',
      }).returning();

      return { user, workspace };
    });

    // Create session
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(sessions).values({
      userId: result.user.id,
      token,
      expiresAt,
    });

    reply.setCookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return reply.status(201).send({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        role: result.user.role,
        workspaceId: result.workspace.id,
      },
    });
  });

  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // Create session
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      userId: user.id,
      token,
      expiresAt,
    });

    reply.setCookie('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        workspaceId: user.workspaceId,
      },
    });
  });

  // POST /api/auth/logout
  app.post('/logout', async (request, reply) => {
    const token = request.cookies?.session;
    if (token) {
      await db.delete(sessions).where(eq(sessions.token, token));
    }
    reply.clearCookie('session', { path: '/' });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  app.get('/me', async (request, reply) => {
    const token = request.cookies?.session;
    if (!token) {
      throw new AppError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const session = (await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
      with: { user: true },
    })) as any;

    if (!session || session.expiresAt < new Date()) {
      throw new AppError('Session expired', 401, 'SESSION_EXPIRED');
    }

    return reply.send({
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
        role: session.user.role,
        workspaceId: session.user.workspaceId,
      },
    });
  });
}
