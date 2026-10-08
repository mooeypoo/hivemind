import type { Store } from '@netlify/blobs';

export interface VersionedEntry {
  readonly data: unknown;
  /** The Blobs ETag, used with `onlyIfMatch`. */
  readonly version: string;
}

/**
 * Reads a JSON entry with its ETag. Netlify Blobs returns the ETag on GET, but the local
 * emulator used by `netlify dev` and tests does not; it only lists ETags. In that case the
 * ETag is listed *before* the data is read again, so a write in between leaves us with an
 * older ETag: the next conditional write fails as a conflict instead of overwriting it.
 */
export const readVersioned = async (store: Store, key: string): Promise<VersionedEntry | null> => {
  const entry = await store.getWithMetadata(key, { type: 'json' });
  if (entry === null) return null;
  if (entry.etag !== undefined && entry.etag !== '')
    return { data: entry.data, version: entry.etag };

  const { blobs } = await store.list({ prefix: key });
  const version = blobs.find((blob) => blob.key === key)?.etag;
  const data: unknown = await store.get(key, { type: 'json' });
  if (version === undefined || data === null) return null;
  return { data, version };
};

/**
 * Creates the entry when `expectedVersion` is null, otherwise replaces it only if unchanged.
 * Returns false when another write got there first.
 */
export const writeVersioned = async (
  store: Store,
  key: string,
  record: unknown,
  expectedVersion: string | null,
): Promise<boolean> => {
  const condition =
    expectedVersion === null ? { onlyIfNew: true as const } : { onlyIfMatch: expectedVersion };
  const { modified } = await store.setJSON(key, record, condition);
  return modified;
};
