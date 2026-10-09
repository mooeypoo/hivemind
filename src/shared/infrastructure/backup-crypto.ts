import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cryptography for backups, from one secret (`BACKUP_KEY`). Separate keys are derived for
 * each purpose, so a sealed ballot, an erasure fingerprint and the key id can't be confused.
 */
export interface BackupCrypto {
  /** Identifies the key without revealing it, so a backup made with another key is recognised. */
  readonly keyId: string;
  /** AES-256-GCM: only the site holding the same key can read or alter it. */
  seal(data: unknown): string;
  /** Null when the data was sealed with another key or was altered. */
  open(sealed: string): unknown;
  /** A one-way, keyed fingerprint of an id: can't be reversed or recomputed without the key. */
  fingerprint(id: string): string;
}

const derive = (secret: string, purpose: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, 'votable-lists', purpose, 32));

const VERSION = 'v1';

export const createBackupCrypto = (secret: string): BackupCrypto => {
  const sealKey = derive(secret, 'backup-seal');
  const fingerprintKey = derive(secret, 'erasure-fingerprint');
  const keyId = createHmac('sha256', derive(secret, 'key-id'))
    .update('key-id')
    .digest('hex')
    .slice(0, 16);

  return {
    keyId,
    seal(data) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', sealKey, iv);
      const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
      return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')}`;
    },
    open(sealed) {
      const [version, payload] = sealed.split('.');
      if (version !== VERSION || payload === undefined) return null;
      const bytes = Buffer.from(payload, 'base64url');
      if (bytes.length < 29) return null;
      try {
        const decipher = createDecipheriv('aes-256-gcm', sealKey, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        const plain = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
        return JSON.parse(plain.toString('utf8')) as unknown;
      } catch {
        return null;
      }
    },
    fingerprint: (id) => createHmac('sha256', fingerprintKey).update(id).digest('base64url'),
  };
};
