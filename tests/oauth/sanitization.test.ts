import { describe, expect, it } from 'vitest';
import { sanitizeDisplayData } from '../../apps/web/src/lib/oauth';

describe('Display probe sanitization', () => {
  it('preserves structure and redacts sensitive values recursively', () => {
    const sanitized = sanitizeDisplayData({
      access_token: 'secret-token-123',
      refresh_token: 'secret-refresh-456',
      open_id: 'user-open-id',
      profile_url: 'https://example.com/user',
      nested: {
        email: 'user@example.com',
        phone: '+1234567890',
        access_token: 'nested-secret-token',
      },
      items: [{ title: 'Secret Item', url: 'https://example.com/secret' }],
    });

    expect(sanitized).toEqual({
      access_token: '<REDACTED>',
      refresh_token: '<REDACTED>',
      open_id: '<REDACTED>',
      profile_url: '<REDACTED>',
      nested: {
        email: '<REDACTED>',
        phone: '<REDACTED>',
        access_token: '<REDACTED>',
      },
      items: [{ title: '<REDACTED>', url: '<REDACTED>' }],
    });
  });
});
