/**
 * TTSData API server — Fastify + Drizzle ORM
 * M0: Auth, tenant boundaries, TikTok OAuth, product CRUD
 *
 * Production boot is fail-closed: `loadRuntimeConfig` aborts on missing,
 * placeholder, or unsafe configuration rather than falling back to a
 * development default. See `lib/runtime-config.ts`.
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
import { registerDisplayRoutes } from './routes/display';
import { registerWatchlistRoutes } from './routes/watchlists';
import { registerAlertRoutes } from './routes/alerts';
import { registerCreatorRoutes } from './routes/creators';
import { registerTodayRoutes } from './routes/today';
import { registerDataQualityRoutes } from './routes/dataQuality';
import { registerPersonalScoreRoutes } from './routes/personalScore';
import { registerOnboardingRoutes } from './routes/onboarding';
import { registerMyPerformanceRoutes } from './routes/myPerformance';
import { registerReferralRoutes } from './routes/referrals';
import { registerHealthRoutes } from './routes/health';
import { registerCCOSRoutes } from './routes/ccos';
import { registerAIRoutes } from './routes/ai';
import { errorHandler } from './lib/errors';
import { loadRuntimeConfig, describeRuntimeConfig, type RuntimeConfig } from './lib/runtime-config';

export async function buildServer(config: RuntimeConfig) {
  const app = Fastify({
    trustProxy: config.trustProxy,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // Never log credential-bearing material: OAuth codes, tokens and cookies
      // all travel through these routes.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.access_token',
          'req.body.refresh_token',
          'req.body.code',
          'req.body.client_secret',
        ],
        censor: '[REDACTED]',
      },
      transport: config.environment === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  });

  // Security headers
  await app.register(helmet);

  // CORS: explicit allow-list only. No wildcard, no origin reflection.
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  });

  // Cookie support for sessions
  await app.register(cookie, {
    secret: config.authSecret,
  });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Global error handler
  app.setErrorHandler(errorHandler);

  // Health check (liveness/readiness; queries the database)
  await app.register(registerHealthRoutes, { prefix: '/health' });

  // Auth routes
  await app.register(registerAuthRoutes, { prefix: '/api/auth' });

  // Product routes
  await app.register(registerProductRoutes, { prefix: '/api/products' });

  // TikTok routes
  await app.register(registerTikTokRoutes, { prefix: '/api/tiktok' });

  // Connection deletion routes
  await app.register(registerConnectionRoutes, { prefix: '/api/connections' });

  // Issue #20 — TikTok Display authorization lifecycle
  await app.register(registerDisplayRoutes, { prefix: '/api/display' });

  // Watchlist routes
  await app.register(registerWatchlistRoutes, { prefix: '/api/watchlists' });

  // Alert routes
  await app.register(registerAlertRoutes, { prefix: '/api/alerts' });

  // Creator discovery routes
  await app.register(registerCreatorRoutes, { prefix: '/api/creators' });

  // Today opportunity feed
  await app.register(registerTodayRoutes, { prefix: '/api/today' });

  // Data quality monitoring
  await app.register(registerDataQualityRoutes, { prefix: '/api/data-quality' });

  // Personal Performance Score
  await app.register(registerPersonalScoreRoutes, { prefix: '/api/personal-score' });

  // Onboarding
  await app.register(registerOnboardingRoutes, { prefix: '/api/onboarding' });

  // My Performance Dashboard
  await app.register(registerMyPerformanceRoutes, { prefix: '/api/my-performance' });

  // Referral system
  await app.register(registerReferralRoutes, { prefix: '/api/referrals' });

  // Creator Commerce Operating System
  await app.register(registerCCOSRoutes, { prefix: '/api/ccos' });
  await app.register(registerAIRoutes, { prefix: '/api/ai' });

  return app;
}

async function main() {
  // Fail closed before opening a listener or a database pool.
  const config = loadRuntimeConfig();
  const app = await buildServer(config);

  // Graceful shutdown: stop accepting connections and drain in-flight requests.
  // Required for zero-downtime deploys and container restarts.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    // Redacted configuration summary: no secret values.
    app.log.info({ config: describeRuntimeConfig(config) }, 'TTSData API listening');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Only start when executed directly, so tests can import buildServer.
if (require.main === module) {
  void main();
}
