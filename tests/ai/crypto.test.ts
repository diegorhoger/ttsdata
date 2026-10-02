import { describe, expect, it } from 'vitest';
import { AIKeyCipher } from '../../packages/db/src/ai-crypto';

const key = Buffer.alloc(32, 7).toString('base64');
const secret = 'sk-live-sensitive-credential-123456';

describe('AI key encryption', () => {
  it('round-trips with tenant/user/mode context and exposes only a one-way fingerprint', () => {
    const cipher = new AIKeyCipher({ '1': key }, 1);
    const encrypted = cipher.encrypt(secret, 'tenant:alpha:user:42:byok');
    expect(cipher.decrypt(encrypted.encrypted, encrypted.version, 'tenant:alpha:user:42:byok')).toBe(secret);
    expect(encrypted.encrypted).not.toContain(secret);
    const fingerprint = cipher.fingerprint(secret);
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{12}…$/);
    expect(fingerprint).not.toContain(secret);
    expect(fingerprint).not.toContain(secret.slice(-4));
  });

  it('rejects authentication under the wrong tenant/user/mode context without revealing plaintext', () => {
    const cipher = new AIKeyCipher({ '1': key }, 1);
    const encrypted = cipher.encrypt(secret, 'tenant:alpha:user:42:byok');
    expect(() => cipher.decrypt(encrypted.encrypted, 1, 'tenant:beta:user:42:byok')).toThrow('AI credential cannot be decrypted');
  });

  it('rejects unknown key versions and tampered ciphertext with generic errors', () => {
    const cipher = new AIKeyCipher({ '1': key }, 1);
    const encrypted = cipher.encrypt(secret, 'context');
    expect(() => cipher.decrypt(encrypted.encrypted, 99, 'context')).toThrow('AI encryption version unavailable');
    const parts = encrypted.encrypted.split('.');
    const ciphertext = Buffer.from(parts[2], 'base64');
    ciphertext[0] ^= 1;
    parts[2] = ciphertext.toString('base64');
    expect(() => cipher.decrypt(parts.join('.'), 1, 'context')).toThrow('AI credential cannot be decrypted');
  });
});
