import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** AES-256-GCM, versioned encryption keys and tenant/user/mode authenticated context. No raw suffix is exposed. */
export class AIKeyCipher {
  private readonly keys = new Map<number, Buffer>();
  constructor(keyring: Record<string, string>, readonly activeVersion: number) {
    for (const [version, encoded] of Object.entries(keyring)) {
      const key = Buffer.from(encoded, 'base64');
      if (!/^\d+$/.test(version) || !Number.isSafeInteger(Number(version)) || Number(version) < 1 || key.length !== 32) throw new Error('Invalid AI encryption configuration');
      this.keys.set(Number(version), key);
    }
    if (!this.keys.has(activeVersion)) throw new Error('Active AI encryption version unavailable');
  }
  encrypt(value: string, context: string) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.activeVersion)!, iv);
    cipher.setAAD(Buffer.from(context)); const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { version: this.activeVersion, encrypted: [iv, cipher.getAuthTag(), ciphertext].map((item) => item.toString('base64')).join('.') };
  }
  decrypt(encrypted: string, version: number, context: string) {
    const key = this.keys.get(version); if (!key) throw new Error('AI encryption version unavailable');
    try {
      const [iv, tag, ciphertext] = encrypted.split('.').map((item) => Buffer.from(item, 'base64'));
      const cipher = createDecipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(ciphertext), cipher.final()]).toString('utf8');
    } catch { throw new Error('AI credential cannot be decrypted'); }
  }
  fingerprint(value: string) { return `sha256:${createHash('sha256').update(value).digest('hex').slice(0, 12)}…`; }
}
