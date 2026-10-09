import { describe, expect, test } from 'vitest';
import { createBackupCrypto } from './backup-crypto.ts';

const key = 'a-backup-key-that-is-long-enough-to-use!!';
const crypto = createBackupCrypto(key);

describe('backup crypto', () => {
  test('seals and opens data, and the sealed form reveals nothing', () => {
    const sealed = crypto.seal({ scores: { 'tmdb-movie.78': 9 } });
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('tmdb');
    expect(crypto.open(sealed)).toEqual({ scores: { 'tmdb-movie.78': 9 } });
  });

  test('two seals of the same data differ', () => {
    expect(crypto.seal({ a: 1 })).not.toBe(crypto.seal({ a: 1 }));
  });

  test('another key, or a tampered seal, opens to null', () => {
    const sealed = crypto.seal({ a: 1 });
    expect(createBackupCrypto('a-different-key-that-is-long-enough!!').open(sealed)).toBeNull();
    const tampered = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(crypto.open(tampered)).toBeNull();
    expect(crypto.open('garbage')).toBeNull();
  });

  test('the key id is stable per key, and differs between keys', () => {
    expect(createBackupCrypto(key).keyId).toBe(crypto.keyId);
    expect(createBackupCrypto(`${key}x`).keyId).not.toBe(crypto.keyId);
    expect(crypto.keyId).not.toContain(key);
  });

  test('fingerprints are stable, one-way and keyed', () => {
    expect(crypto.fingerprint('80351110224678912')).toBe(crypto.fingerprint('80351110224678912'));
    expect(crypto.fingerprint('80351110224678912')).not.toContain('80351110224678912');
    expect(createBackupCrypto(`${key}x`).fingerprint('80351110224678912')).not.toBe(
      crypto.fingerprint('80351110224678912'),
    );
  });
});
