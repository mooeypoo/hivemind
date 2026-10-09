import type { Store } from '@netlify/blobs';
import type { ErasureRegistry } from '../application/ports.ts';

/*
 * Store: `identity`. Keys: erased/{fingerprint} → { v: 1, erasedAt }. The fingerprint is a
 * keyed one-way hash of the member's id: no id, name or anything else is kept.
 */
/** Keyed one-way fingerprints (the site's backup crypto provides them). */
export interface Fingerprinter {
  fingerprint(id: string): string;
}

export const createBlobsErasureRegistry = (
  store: Store,
  crypto: Fingerprinter,
): ErasureRegistry => ({
  async record(memberId, at) {
    await store.setJSON(`erased/${crypto.fingerprint(memberId)}`, {
      v: 1,
      erasedAt: at.toISOString(),
    });
  },

  async wasErased(memberId) {
    return (await store.getMetadata(`erased/${crypto.fingerprint(memberId)}`)) !== null;
  },

  async forgetBefore(cutoff) {
    const { blobs } = await store.list({ prefix: 'erased/' });
    let forgotten = 0;
    for (const blob of blobs) {
      const record = (await store.get(blob.key, { type: 'json' })) as { erasedAt?: string } | null;
      if (record?.erasedAt === undefined || new Date(record.erasedAt) < cutoff) {
        await store.delete(blob.key);
        forgotten += 1;
      }
    }
    return forgotten;
  },
});
