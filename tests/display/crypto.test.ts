import { describe, expect, it } from 'vitest';
import { CredentialCipher, credentialContext, loadCredentialCipher } from '../../packages/db/src/credential-crypto';

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');
const cipher = new CredentialCipher({ '1': KEY_A, '2': KEY_B }, 2);

describe('Display credential encryption', () => {
  it('round-trips a credential and never emits plaintext', () => {
    const secret = 'act.' + 'x'.repeat(40);
    const sealed = cipher.encrypt(secret, 'ctx');
    expect(sealed.encrypted).not.toContain(secret);
    expect(sealed.version).toBe(2);
    expect(cipher.decrypt(sealed.encrypted, sealed.version, 'ctx')).toBe(secret);
  });

  it('produces three base64 segments, so plaintext cannot satisfy the shape', () => {
    const sealed = cipher.encrypt('token-value', 'ctx');
    expect(sealed.encrypted.split('.')).toHaveLength(3);
    expect(sealed.encrypted).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  });

  it('fails closed when the AAD context differs', () => {
    const sealed = cipher.encrypt('token-value', credentialContext({
      workspaceId: 'ws-a', userId: 'user-a', provider: 'tiktok_display', connectionId: 'c1',
    }));
    expect(() => cipher.decrypt(sealed.encrypted, sealed.version, credentialContext({
      workspaceId: 'ws-b', userId: 'user-a', provider: 'tiktok_display', connectionId: 'c1',
    }))).toThrow('cannot be decrypted');
  });

  it('rejects an unknown key version', () => {
    const sealed = cipher.encrypt('token-value', 'ctx');
    expect(() => cipher.decrypt(sealed.encrypted, 99, 'ctx')).toThrow('version unavailable');
  });

  it('detects tampering with the ciphertext', () => {
    const sealed = cipher.encrypt('token-value', 'ctx');
    const parts = sealed.encrypted.split('.');
    parts[2] = Buffer.from('tampered-value-here').toString('base64');
    expect(() => cipher.decrypt(parts.join('.'), sealed.version, 'ctx')).toThrow();
  });

  it('rejects a malformed keyring', () => {
    expect(() => new CredentialCipher({ '1': Buffer.alloc(16, 1).toString('base64') }, 1)).toThrow('Invalid display credential');
    expect(() => new CredentialCipher({ '1': KEY_A }, 5)).toThrow('Active display credential version unavailable');
  });

  it('fingerprints irreversibly and hashes the account identity', () => {
    const secret = 'act.' + 'y'.repeat(40);
    const fingerprint = cipher.fingerprint(secret);
    expect(fingerprint.startsWith('sha256:')).toBe(true);
    expect(fingerprint).not.toContain(secret);
    const account = cipher.accountHash('provider-account-123');
    expect(account).toMatch(/^[a-f0-9]{64}$/);
    expect(account).not.toContain('provider-account-123');
  });

  it('loads configuration from the environment and fails closed when absent', () => {
    expect(() => loadCredentialCipher({} as NodeJS.ProcessEnv)).toThrow('DISPLAY_CREDENTIAL_KEYS is required');
    expect(() => loadCredentialCipher({ DISPLAY_CREDENTIAL_KEYS: '{"1":"' + KEY_A + '"}' } as NodeJS.ProcessEnv))
      .toThrow('DISPLAY_CREDENTIAL_VERSION is required');
    expect(() => loadCredentialCipher({ DISPLAY_CREDENTIAL_KEYS: 'not-json', DISPLAY_CREDENTIAL_VERSION: '1' } as NodeJS.ProcessEnv))
      .toThrow('must be a JSON object');
    const loaded = loadCredentialCipher({ DISPLAY_CREDENTIAL_KEYS: JSON.stringify({ '1': KEY_A }), DISPLAY_CREDENTIAL_VERSION: '1' } as NodeJS.ProcessEnv);
    expect(loaded.versions).toEqual([1]);
  });

  it('supports key rotation by decrypting with an older version', () => {
    const old = new CredentialCipher({ '1': KEY_A }, 1);
    const sealed = old.encrypt('rotating-secret', 'ctx');
    const rotated = new CredentialCipher({ '1': KEY_A, '2': KEY_B }, 2);
    expect(rotated.decrypt(sealed.encrypted, sealed.version, 'ctx')).toBe('rotating-secret');
  });
});
