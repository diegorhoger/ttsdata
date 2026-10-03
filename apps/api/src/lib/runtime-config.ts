/**
 * Production runtime configuration for apps/api.
 *
 * Fails closed. A production boot with missing or placeholder configuration
 * aborts rather than silently falling back to a development default — a known
 * `AUTH_SECRET` or a localhost CORS origin must never be reachable in
 * production.
 *
 * The TikTok/Display contract is validated by `loadDisplayConfig()` in
 * `@ttsdata/db`, which the Display routes already use. This module covers the
 * process-level contract: listen binding, database, CORS origin, cookie secret.
 */

export type RuntimeEnvironment = 'production' | 'development' | 'test';

export interface RuntimeConfig {
  environment: RuntimeEnvironment;
  port: number;
  host: string;
  databaseUrl: string;
  authSecret: string;
  /** Explicit CORS allow-list. Never a wildcard in production. */
  allowedOrigins: string[];
  /** Canonical public origin of the API itself, used for absolute URLs. */
  apiOrigin: string | null;
  trustProxy: string | false;
}

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
  }
}

/** Values that indicate an unset or copy-pasted placeholder. */
const PLACEHOLDER_PATTERNS = [
  /change[-_ ]?me/i,
  /dev[-_ ]?secret/i,
  /your[-_ ]/i,
  /placeholder/i,
  /^xxx+$/i,
  /^todo$/i,
  /example\.com/i,
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RuntimeConfigError(`${name} is required`);
  }
  return value.trim();
}

function parsePort(raw: string | undefined): number {
  const value = Number(raw ?? '4000');
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new RuntimeConfigError('PORT must be an integer between 1 and 65535');
  }
  return value;
}

/**
 * Parse the CORS allow-list.
 *
 * `ALLOWED_ORIGINS` is a comma-separated list. In production it is required and
 * must not contain a wildcard or a localhost origin: an API holding encrypted
 * provider credentials must not accept cross-origin calls from anywhere.
 */
function parseAllowedOrigins(env: NodeJS.ProcessEnv, environment: RuntimeEnvironment): string[] {
  const raw = env.ALLOWED_ORIGINS?.trim() ?? '';
  const origins = raw.split(',').map((item) => item.trim()).filter(Boolean);

  if (environment !== 'production') {
    return origins.length > 0 ? origins : ['http://localhost:3000'];
  }

  if (origins.length === 0) {
    throw new RuntimeConfigError('ALLOWED_ORIGINS is required in production');
  }
  for (const origin of origins) {
    if (origin === '*' || origin === 'true') {
      throw new RuntimeConfigError('ALLOWED_ORIGINS must not contain a wildcard in production');
    }
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new RuntimeConfigError(`ALLOWED_ORIGINS entry is not an absolute URL: ${origin}`);
    }
    if (parsed.protocol !== 'https:') {
      throw new RuntimeConfigError(`ALLOWED_ORIGINS must use https in production: ${origin}`);
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
      throw new RuntimeConfigError(`ALLOWED_ORIGINS must not be localhost in production: ${origin}`);
    }
  }
  return origins;
}

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const environment = (env.NODE_ENV === 'production' ? 'production'
    : env.NODE_ENV === 'test' ? 'test' : 'development') as RuntimeEnvironment;

  const port = parsePort(env.PORT);
  const host = env.HOST?.trim() || '0.0.0.0';
  const databaseUrl = required(env, 'DATABASE_URL');
  const authSecret = required(env, 'AUTH_SECRET');

  if (environment === 'production') {
    if (isPlaceholder(authSecret)) {
      throw new RuntimeConfigError('AUTH_SECRET looks like a placeholder value');
    }
    if (authSecret.length < 32) {
      throw new RuntimeConfigError('AUTH_SECRET must be at least 32 characters in production');
    }
    if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
      throw new RuntimeConfigError('DATABASE_URL must be a PostgreSQL connection string');
    }
    // A localhost database in production is almost always a misconfiguration:
    // the container would talk to itself and lose all data on redeploy.
    // ALLOW_LOCALHOST_DATABASE exists only so the packaged service can be
    // smoke-tested end to end (NODE_ENV=production) in environments without a
    // remote database. It must never be set in a real deployment.
    const allowLocalhostDatabase = env.ALLOW_LOCALHOST_DATABASE === 'true';
    if (!allowLocalhostDatabase && /localhost|127\.0\.0\.1/.test(databaseUrl)) {
      throw new RuntimeConfigError('DATABASE_URL must not point at localhost in production');
    }
  }

  const apiOrigin = env.API_ORIGIN?.trim() || null;
  if (environment === 'production' && apiOrigin) {
    let parsed: URL;
    try {
      parsed = new URL(apiOrigin);
    } catch {
      throw new RuntimeConfigError('API_ORIGIN must be an absolute URL');
    }
    if (parsed.protocol !== 'https:') {
      throw new RuntimeConfigError('API_ORIGIN must use https in production');
    }
  }

  return {
    environment,
    port,
    host,
    databaseUrl,
    authSecret,
    allowedOrigins: parseAllowedOrigins(env, environment),
    apiOrigin,
    trustProxy: env.TRUSTED_PROXY_CIDRS?.split(',').map((s) => s.trim()).filter(Boolean).join(',') || false,
  };
}

/** Redacted summary for startup logging. Never contains a secret value. */
export function describeRuntimeConfig(config: RuntimeConfig): Record<string, unknown> {
  return {
    environment: config.environment,
    port: config.port,
    host: config.host,
    database: config.databaseUrl.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@'),
    allowedOrigins: config.allowedOrigins,
    apiOrigin: config.apiOrigin,
    authSecret: `len=${config.authSecret.length}`,
    trustProxy: config.trustProxy !== false,
  };
}
