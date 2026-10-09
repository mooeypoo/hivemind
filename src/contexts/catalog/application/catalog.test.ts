import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, err, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { SequentialIds } from '../../../shared/kernel/testing/index.ts';
import type { ItemSourceRef, PresetId } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';
import { createFreeformSource } from '../infrastructure/freeform-source.ts';
import { createPresetSource } from '../infrastructure/preset-source.ts';
import { InMemoryPresetRepository } from '../infrastructure/testing/in-memory-preset-repository.ts';
import { makeAvailableSources } from './available-sources.ts';
import { makeCheckSource } from './check-source.ts';
import { makeImportPreset } from './import-preset.ts';
import type { ItemSources } from './ports.ts';
import { makeResolve } from './resolve.ts';
import { makeSearch } from './search.ts';
import { makeSeedItems } from './seed-items.ts';
import { makeExportPreset, makeRestorePreset } from './preset-backup.ts';

const member = (isAdmin: boolean): Actor => ({
  kind: 'member',
  memberId: '1' as MemberId,
  displayName: 'Ada',
  roleIds: [],
  isAdmin,
});
const admin = member(true);

let presets: InMemoryPresetRepository;
let sources: ItemSources;

beforeEach(() => {
  presets = new InMemoryPresetRepository();
  sources = { freeform: createFreeformSource(), preset: createPresetSource(presets) };
});

const importPreset = () => makeImportPreset({ presets, ids: new SequentialIds() });

const importAlbums = async (): Promise<ItemSourceRef> => {
  const result = await importPreset()(admin, {
    csv: 'title,subtitle\nOK Computer,Radiohead\nKid A,Radiohead\nBlue,Joni Mitchell',
  });
  if (!result.ok) throw new Error(result.error.code);
  return { kind: 'preset', presetId: result.value.presetId };
};

describe('import preset', () => {
  test('is for Admins only', async () => {
    for (const actor of [anonymous, member(false)]) {
      const result = await importPreset()(actor, { csv: 'title\nAlien' });
      expect(result.ok).toBe(false);
    }
  });

  test('stores the parsed items and reports how many', async () => {
    const result = await importPreset()(admin, { csv: 'title\nAlien\nHeat' });
    expect(result).toEqual({ ok: true, value: { presetId: 'id-1', count: 2 } });
    expect((await presets.get('id-1' as PresetId))?.items).toHaveLength(2);
  });

  test('returns every CSV problem', async () => {
    const result = await importPreset()(admin, { csv: 'title\nAlien\nalien' });
    expect(!result.ok && result.error.details).toEqual(['Row 3: duplicates row 2.']);
  });
});

describe('available sources', () => {
  test('lists only the sources this site offers, for Admins', () => {
    expect(makeAvailableSources({ sources })(admin)).toEqual({
      ok: true,
      value: ['freeform', 'preset'],
    });
    expect(makeAvailableSources({ sources })(member(false)).ok).toBe(false);
  });
});

describe('search', () => {
  test('finds preset items by any part of the title or subtitle', async () => {
    const ref = await importAlbums();
    const result = await makeSearch({ sources })(ref, 'radio');
    expect(result.ok && result.value.map((item) => item.title)).toEqual(['OK Computer', 'Kid A']);
  });

  test('returns nothing for an empty query or free text', async () => {
    expect(await makeSearch({ sources })(await importAlbums(), '   ')).toEqual({
      ok: true,
      value: [],
    });
    expect(await makeSearch({ sources })({ kind: 'freeform' }, 'x')).toEqual({
      ok: true,
      value: [],
    });
  });

  test('is unavailable for a source this site does not offer', async () => {
    expect(await makeSearch({ sources })({ kind: 'tmdb-movie' }, 'alien')).toEqual(
      err(catalogErrors.sourceUnavailable),
    );
  });
});

describe('resolve', () => {
  test('free text: cleans the title and keys it for duplicates', async () => {
    const result = await makeResolve({ sources })({ kind: 'freeform' }, '  The   Matrix ');
    expect(result).toEqual({
      ok: true,
      value: {
        source: 'freeform',
        externalId: 'the matrix',
        title: 'The Matrix',
        subtitle: null,
        imageUrl: null,
      },
    });
  });

  test('free text: rejects an empty or overlong title', async () => {
    for (const title of ['  ', 'x'.repeat(201)]) {
      expect(await makeResolve({ sources })({ kind: 'freeform' }, title)).toEqual(
        err(catalogErrors.invalidTitle),
      );
    }
  });

  test('preset: accepts only items in the preset', async () => {
    const ref = await importAlbums();
    expect((await makeResolve({ sources })(ref, 'kid a')).ok).toBe(true);
    expect(await makeResolve({ sources })(ref, 'abbey road')).toEqual(
      err(catalogErrors.itemNotFound),
    );
  });
});

describe('check source', () => {
  const nominations = { seeded: false };

  test('accepts offered sources and existing presets', async () => {
    const check = makeCheckSource({ sources, presets });
    expect((await check({ kind: 'freeform' }, nominations)).ok).toBe(true);
    expect((await check(await importAlbums(), nominations)).ok).toBe(true);
  });

  test('rejects a missing preset and an unavailable source', async () => {
    const check = makeCheckSource({ sources, presets });
    expect(await check({ kind: 'preset', presetId: 'nope' as PresetId }, nominations)).toEqual(
      err(catalogErrors.presetNotFound),
    );
    expect(await check({ kind: 'tmdb-movie' }, nominations)).toEqual(
      err(catalogErrors.sourceUnavailable),
    );
  });

  test('allows seeding only from a preset', async () => {
    const check = makeCheckSource({ sources, presets });
    expect((await check(await importAlbums(), { seeded: true })).ok).toBe(true);
    expect(await check({ kind: 'freeform' }, { seeded: true })).toEqual(
      err(catalogErrors.cannotSeed),
    );
  });
});

describe('seed items', () => {
  test('returns every preset item, to become the entries of a seeded list', async () => {
    const result = await makeSeedItems({ presets })(await importAlbums());
    expect(result.ok && result.value).toHaveLength(3);
  });

  test('refuses sources that cannot seed', async () => {
    expect(await makeSeedItems({ presets })({ kind: 'freeform' })).toEqual(
      err(catalogErrors.cannotSeed),
    );
  });
});

describe('preset backups', () => {
  test('export the rows and restore them under a new id', async () => {
    const ref = await importAlbums();
    if (ref.kind !== 'preset') throw new Error('fixture');
    const rows = await makeExportPreset({ presets })(ref.presetId);
    expect(rows?.items).toHaveLength(3);
    const restored = await makeRestorePreset({ presets, ids: new SequentialIds() })(
      rows ?? { items: [] },
    );
    expect(restored.ok && restored.value).not.toBe(ref.presetId);
  });

  test('refuse invalid rows, like an import would', async () => {
    const restored = await makeRestorePreset({ presets, ids: new SequentialIds() })({
      items: [
        { title: 'Blue', subtitle: null },
        { title: 'blue', subtitle: null },
      ],
    });
    expect(!restored.ok && restored.error.code).toBe('catalog.invalid-preset');
  });
});
