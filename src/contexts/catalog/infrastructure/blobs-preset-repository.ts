import type { Store } from '@netlify/blobs';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import { domainError, err, ok } from '../../../shared/kernel/index.ts';
import type { PresetRepository } from '../application/ports.ts';
import type { CatalogItem, PresetId } from '../domain/catalog-item.ts';
import type { Preset } from '../domain/preset.ts';

interface PresetRecordV1 {
  readonly v: 1;
  readonly id: string;
  readonly items: readonly { externalId: string; title: string; subtitle: string | null }[];
}

const key = (id: PresetId): string => `preset/${id}`;

const fromRecord = (data: unknown): Preset => {
  const record = data as Partial<PresetRecordV1> | null;
  if (record?.v !== 1 || typeof record.id !== 'string' || record.items === undefined) {
    throw new Error('Unreadable preset record');
  }
  return {
    id: record.id as PresetId,
    items: record.items.map((item): CatalogItem => ({
      source: 'preset',
      externalId: item.externalId,
      title: item.title,
      subtitle: item.subtitle,
      imageUrl: null,
    })),
  };
};

/** Store: `catalog`. Keys: `preset/{presetId}`. */
export const createBlobsPresetRepository = (store: Store): PresetRepository => ({
  async get(id) {
    const entry = await readVersioned(store, key(id));
    return entry === null ? null : fromRecord(entry.data);
  },

  async create(preset) {
    const record: PresetRecordV1 = {
      v: 1,
      id: preset.id,
      items: preset.items.map(({ externalId, title, subtitle }) => ({
        externalId,
        title,
        subtitle,
      })),
    };
    const written = await writeVersioned(store, key(preset.id), record, null);
    return written
      ? ok(undefined)
      : err(domainError('conflict', 'catalog.preset-exists', 'A preset with this id exists.'));
  },
});
