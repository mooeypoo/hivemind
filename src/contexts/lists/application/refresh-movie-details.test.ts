import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  domainError,
  err,
  ok,
  type Actor,
  type MemberId,
  type RoleId,
} from '../../../shared/kernel/index.ts';
import type { Entry, EntryId, ItemSnapshot } from '../domain/entry.ts';
import type { List, ListConfig, ListId } from '../domain/list.ts';
import type { Catalog } from './ports.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeRefreshMovieDetails } from './refresh-movie-details.ts';

const actor = (id: string, isAdmin = false): Actor => ({
  kind: 'member',
  memberId: id as MemberId,
  displayName: id,
  roleIds: [] as RoleId[],
  isAdmin,
});
const admin = actor('admin', true);
const member = actor('member');
const now = new Date('2026-03-12T00:00:00.000Z');
const config: ListConfig = {
  title: 'Best Sci-Fi Movies',
  slug: 'best-sci-fi',
  description: '',
  itemSource: { kind: 'tmdb-movie' },
  entryMode: 'nominations',
  scale: { min: 1, max: 10 },
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  ranking: { strategy: 'bayesian', minVotes: 3 },
  showNominators: true,
  requiredRoleIds: [],
  scoreVisibility: 'private',
};

const makeEntry = (
  externalId: string,
  patch: Partial<Entry> = {},
  itemPatch: Partial<ItemSnapshot> = {},
): Entry => ({
  id: `tmdb-movie.${externalId}` as EntryId,
  listId: 'list-1' as ListId,
  item: {
    source: 'tmdb-movie',
    externalId,
    title: `Movie ${externalId}`,
    subtitle: '2000',
    imageUrl: 'https://image.tmdb.org/t/p/w342/poster.jpg',
    ...itemPatch,
  },
  nominatedBy: null,
  nominatedAt: now,
  snapshotPurgedAt: null,
  ...patch,
});

let lists: InMemoryListRepository;
let slugs: InMemorySlugIndex;
let entries: InMemoryEntryRepository;
let catalog: FakeCatalog;
let resolve: ReturnType<typeof vi.fn<Catalog['resolve']>>;

const setUp = async (phase: List['phase'] = 'published') => {
  lists = new InMemoryListRepository();
  slugs = new InMemorySlugIndex();
  entries = new InMemoryEntryRepository();
  catalog = new FakeCatalog();
  resolve = vi.fn<Catalog['resolve']>((_ref, externalId) =>
    Promise.resolve(
      ok<ItemSnapshot>({
        source: 'tmdb-movie',
        externalId,
        title: `Fresh ${externalId}`,
        subtitle: '2099',
        imageUrl: 'https://image.tmdb.org/t/p/w342/new-poster.jpg',
        overview: `Synopsis for ${externalId}`,
        director: 'A Director',
        cast: ['Actor One', 'Actor Two'],
      }),
    ),
  );
  catalog.resolve = resolve;
  await lists.save(
    {
      id: 'list-1' as ListId,
      config,
      schedule: { opensAt: now, nominationsCloseAt: null, closesAt: null },
      phase,
      createdAt: now,
      archivedAt: phase === 'archived' ? now : null,
      visibility: 'public',
    },
    null,
  );
  await slugs.claim(config.slug, 'list-1' as ListId);
};

const refresh = () =>
  makeRefreshMovieDetails({
    lists,
    slugs,
    entries,
    catalog,
  })(admin, { list: config.slug });

describe('refresh missing TMDB movie details', () => {
  beforeEach(async () => setUp());

  test('fills only missing active movie snapshots without replacing existing item data', async () => {
    const missing = makeEntry('78');
    const complete = makeEntry('603', {}, { overview: 'Already here.' });
    const withdrawn = makeEntry('62', { withdrawnAt: now });
    const purged = makeEntry('1891', { snapshotPurgedAt: now });
    await entries.create(missing);
    await entries.create(complete);
    await entries.create(withdrawn);
    await entries.create(purged);

    const result = await refresh();

    expect(result).toEqual({
      ok: true,
      value: { eligible: 2, updated: 1, skipped: 1, failed: 0, remaining: 0 },
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(config.itemSource, '78');
    const saved = await entries.get('list-1' as ListId, missing.id);
    expect(saved?.value.item).toEqual({
      ...missing.item,
      overview: 'Synopsis for 78',
      director: 'A Director',
      cast: ['Actor One', 'Actor Two'],
    });
    expect((await entries.get('list-1' as ListId, complete.id))?.value.item).toEqual(complete.item);
  });

  test('rejects members and archived or non-TMDB lists', async () => {
    await entries.create(makeEntry('78'));
    const forbidden = await makeRefreshMovieDetails({ lists, slugs, entries, catalog })(member, {
      list: config.slug,
    });
    expect(forbidden).toMatchObject({ ok: false, error: { kind: 'forbidden' } });
    expect(resolve).not.toHaveBeenCalled();

    await setUp('archived');
    const archived = await refresh();
    expect(archived).toMatchObject({
      ok: false,
      error: { code: 'lists.movie-details-not-published' },
    });

    await setUp();
    await lists.save(
      {
        id: 'list-1' as ListId,
        config: { ...config, itemSource: { kind: 'freeform' } },
        schedule: null,
        phase: 'draft',
        createdAt: now,
        archivedAt: null,
        visibility: 'public',
      },
      (await lists.get('list-1' as ListId))?.version ?? null,
    );
    const wrongSource = await refresh();
    expect(wrongSource).toMatchObject({ ok: false, error: { code: 'lists.not-movie-list' } });
  });

  test('reports catalog failures and leaves snapshots unchanged', async () => {
    const missing = makeEntry('78');
    await entries.create(missing);
    catalog.resolve = vi.fn<Catalog['resolve']>(() =>
      Promise.resolve(
        err(domainError('unavailable', 'catalog.upstream-unavailable', 'Unavailable')),
      ),
    );

    const result = await refresh();

    expect(result).toEqual({
      ok: true,
      value: { eligible: 1, updated: 0, skipped: 0, failed: 1, remaining: 1 },
    });
    expect((await entries.get('list-1' as ListId, missing.id))?.value.item).toEqual(missing.item);
  });

  test('limits each run to 20 TMDB lookups and reports more work remaining', async () => {
    for (let index = 0; index < 21; index += 1) {
      await entries.create(makeEntry(String(index)));
    }

    const result = await refresh();

    expect(result).toEqual({
      ok: true,
      value: { eligible: 21, updated: 20, skipped: 0, failed: 0, remaining: 1 },
    });
    expect(resolve).toHaveBeenCalledTimes(20);
  });
});
