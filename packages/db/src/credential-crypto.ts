import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Versioned AES-256-GCM credential encryption for provider credentials at rest.
 *
 * Mirrors the repository's established encryption architecture (AI key cipher):
 * a JSON keyring of integer versions -> base64 32-byte master keys, an explicit
 * active version, and AAD binding so a ciphertext cannot be replayed against a
 * different tenant, user, provider or connection identity.
 *
 * Stored format is `iv.tag.ciphertext` (all base64). The database schema asserts
 * that shape, so a plaintext credential can never be persisted by mistake.
 */
export class CredentialCipher {
  private readonly keys = new Map<number, Buffer>();

  constructor(keyring: Record<string, string>, readonly activeVersion: number) {
    for (const [version, encoded] of Object.entries(keyring)) {
      const key = Buffer.from(encoded, 'base64');
      if (!/^\d+$/.test(version) || !Number.isSafeInteger(Number(version)) || Number(version) < 1 || key.length !== 32) {
        throw new Error('Invalid display credential encryption configuration');
      }
      this.keys.set(Number(version), key);
    }
    if (!this.keys.has(activeVersion)) throw new Error('Active display credential version unavailable');
  }

  get versions(): number[] { return [...this.keys.keys()].sort((a, b) => a - b); }

  encrypt(value: string, context: string): { version: number; encrypted: string } {
    if (typeof value !== 'string' || value.length === 0) throw new Error('Display credential value is required');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeVersion)!, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      version: this.activeVersion,
      encrypted: [iv, cipher.getAuthTag(), ciphertext].map((item) => item.toString('base64')).join('.'),
    };
  }

  decrypt(encrypted: string, version: number, context: string): string {
    const key = this.keys.get(version);
    if (!key) throw new Error('Display credential version unavailable');
    try {
      const parts = encrypted.split('.');
      if (parts.length !== 3) throw new Error('shape');
      const [iv, tag, ciphertext] = parts.map((item) => Buffer.from(item, 'base64'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Display credential cannot be decrypted');
    }
  }

  fingerprint(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}\u2026`;
  }

  /** Stable, non-reversible provider account identity. Plaintext account ids are never stored. */
  accountHash(providerAccountId: string): string {
    return createHash('sha256').update(providerAccountId).digest('hex');
  }
}

export function loadCredentialCipher(env: NodeJS.ProcessEnv = process.env): CredentialCipher {
  const raw = env.DISPLAY_CREDENTIAL_KEYS;
  const version = Number(env.DISPLAY_CREDENTIAL_VERSION);
  if (!raw || raw.trim() === '') throw new Error('DISPLAY_CREDENTIAL_KEYS is required');
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('DISPLAY_CREDENTIAL_VERSION is required');
  let keyring: Record<string, string>;
  try {
    keyring = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error('DISPLAY_CREDENTIAL_KEYS must be a JSON object of version to base64 key');
  }
  if (!keyring || typeof keyring !== 'object' || Array.isArray(keyring)) {
    throw new Error('DISPLAY_CREDENTIAL_KEYS must be a JSON object of version to base64 key');
  }
  return new CredentialCipher(keyring, version);
}

/** AAD context: binds ciphertext to tenant + user + provider + connection identity. */
export function credentialContext(identity: {
  workspaceId: string; userId: string; provider: string; connectionId: string;
}): string {
  return `display:${identity.workspaceId}:${identity.userId}:${identity.provider}:${identity.connectionId}`;
}
