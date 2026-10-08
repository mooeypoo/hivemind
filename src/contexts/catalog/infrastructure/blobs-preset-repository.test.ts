import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { PresetId } from '../domain/catalog-item.ts';
import { parsePreset } from '../domain/preset.ts';
import { createBlobsPresetRepository } from './blobs-preset-repository.ts';

let blobs: LocalBlobs;
beforeAll(async () => {
  blobs = await startLocalBlobs();
});
afterAll(async () => {
  await blobs.close();
});

describe('Blobs preset repository', () => {
  test('creates once, reads back, and stores a versioned record', async () => {
    const store = blobs.store('catalog');
    const repo = createBlobsPresetRepository(store);
    const parsed = parsePreset('p1' as PresetId, 'title,subtitle\nAlien,1979\nHeat,');
    if (!parsed.ok) throw new Error('fixture');

    expect(await repo.get('p1' as PresetId)).toBeNull();
    expect((await repo.create(parsed.value)).ok).toBe(true);
    expect(await repo.get('p1' as PresetId)).toEqual(parsed.value);
    expect((await repo.create(parsed.value)).ok).toBe(false);
    expect(await store.get('preset/p1', { type: 'json' })).toEqual({
      v: 1,
      id: 'p1',
      items: [
        { externalId: 'alien', title: 'Alien', subtitle: '1979' },
        { externalId: 'heat', title: 'Heat', subtitle: null },
      ],
    });
  });
});
