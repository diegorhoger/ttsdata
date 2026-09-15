/**
 * TTSData API server — Fastify + Drizzle ORM
 * M0: Auth, tenant boundaries, TikTok OAuth, product CRUD
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from './routes/auth';
import { registerProductRoutes } from './routes/products';
import { registerTikTokRoutes } from './routes/tiktok';
import { registerConnectionRoutes } from './routes/connections';
import { registerWatchlistRoutes } from './routes/watchlists';
import { registerAlertRoutes } from './routes/alerts';
import { registerHealthRoutes } from './routes/health';
import { errorHandler } from './lib/errors';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV === 'development' 
        ? { target: 'pino-pretty' } 
        : undefined,
    },
  });

  // Security headers
  await app.register(helmet);

  // CORS
  await app.register(cors, {
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Cookie support for sessions
  await app.register(cookie, {
    secret: process.env.AUTH_SECRET || 'dev-secret-change-in-production',
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Health check
  await app.register(registerHealthRoutes, { prefix: '/health' });

  // Auth routes
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });

  // Product routes
  await app.register(registerProductRoutes, { prefix: '/api/products' });

  // TikTok routes
  await app.register(registerTikTokRoutes, { prefix: '/api/tiktok' });

  // Connection deletion routes
  await app.register(registerConnectionRoutes, { prefix: '/api/connections' });

  // Watchlist routes
  await app.register(registerWatchlistRoutes, { prefix: '/api/watchlists' });

  // Alert routes
  await app.register(registerAlertRoutes, { prefix: '/api/alerts' });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`TTSData API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
