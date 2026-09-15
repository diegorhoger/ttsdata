/**
 * Audit logging for security-relevant events.
 * 
 * All audit events are immutable and include actor, action, target, and timestamp.
 * Sensitive values (tokens, passwords) must never be logged.
 */

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: {
    userId: string;
    workspaceId: string;
    role: string;
    ip?: string;
  };
  action: string;
  target?: {
    type: string;
    id: string;
  };
  result: 'success' | 'failure';
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void>;
}

/**
 * Sanitize an object by removing sensitive fields.
 * Prevents tokens, passwords, and secrets from appearing in logs.
 */
export function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = [
    'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
    'secret', 'apiKey', 'authorization', 'cookie', 'session',
  ];
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Console-based audit logger (replace with persistent store in production).
 */
export class ConsoleAuditLogger implements AuditLogger {
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    console.log('[AUDIT]', JSON.stringify(sanitizeForAudit(fullEvent as unknown as Record<string, unknown>)));
  }
}
