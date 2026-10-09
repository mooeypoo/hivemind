import { beforeEach, describe, expect, test } from 'vitest';
import type { MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { entryIdFor, PURGED_TITLE, type Entry } from '../domain/entry.ts';
import {
  archive,
  DEFAULT_SCALE,
  newList,
  publish,
  type List,
  type ListId,
} from '../domain/list.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryListRepository,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makePurgeExpiredSnapshots } from './purge-expired-snapshots.ts';

const day = 86_400_000;
const closesAt = new Date('2026-01-31T00:00:00Z');
let clock: FixedClock;
let lists: InMemoryListRepository;
let entries: InMemoryEntryRepository;
beforeEach(() => {
  clock = new FixedClock(new Date('2026-02-01T00:00:00Z'));
  lists = new InMemoryListRepository();
  entries = new InMemoryEntryRepository();
});

const listOf = (id: string, archived: boolean): List => {
  const draft = newList(
    id as ListId,
    {
      title: id,
      slug: id,
      description: '',
      itemSource: { kind: 'tmdb-movie' },
      entryMode: 'nominations',
      scale: DEFAULT_SCALE,
      maxNominationsPerMember: 3,
      resultsVisibility: 'live',
      ranking: { strategy: 'bayesian', minVotes: 0 },
      showNominators: true,
      requiredRoleIds: [],
      scoreVisibility: 'private',
    },
    new Date('2026-01-01T00:00:00Z'),
  );
  const published = publish(
    draft,
    { opensAt: new Date('2026-01-02T00:00:00Z'), nominationsCloseAt: null, closesAt },
    new Date('2026-01-01T00:00:00Z'),
  );
  if (!published.ok) throw new Error('fixture');
  if (!archived) return published.value;
  const done = archive(published.value, new Date('2026-02-01T00:00:00Z'));
  if (!done.ok) throw new Error('fixture');
  return done.value;
};

const entry = (listId: string, source: string, title: string): Entry => {
  const item = {
    source,
    externalId: title.toLowerCase(),
    title,
    subtitle: '1982',
    imageUrl: 'https://image.tmdb.org/t/p/w342/x.jpg',
  };
  return {
    id: entryIdFor(item),
    listId: listId as ListId,
    item,
    nominatedBy: { memberId: 'm1' as MemberId, displayName: 'Ada' },
    nominatedAt: new Date('2026-01-05T00:00:00Z'),
    snapshotPurgedAt: null,
  };
};

const setUp = async () => {
  await lists.save(listOf('archived', true), null);
  await lists.save(listOf('open', false), null);
  await entries.create(entry('archived', 'tmdb-movie', 'Blade Runner'));
  await entries.create(entry('archived', 'freeform', 'Our own title'));
  await entries.create(entry('open', 'tmdb-movie', 'Alien'));
};
const purge = () =>
  makePurgeExpiredSnapshots({ lists, entries, catalog: new FakeCatalog(), clock })();
const titles = async (listId: string) =>
  (await entries.forList(listId as ListId)).map((e) => [e.item.title, e.item.imageUrl]);

describe('snapshot retention', () => {
  test('keeps everything before the retention period ends', async () => {
    await setUp();
    clock.set(new Date(Date.parse('2026-02-01T00:00:00Z') + 182 * day));
    expect(await purge()).toEqual({ listsChecked: 1, entriesPurged: 0 });
  });

  test('after 183 days, removes movie details on archived lists only, keeping identity', async () => {
    await setUp();
    clock.set(new Date(Date.parse('2026-02-01T00:00:00Z') + 183 * day));
    expect(await purge()).toEqual({ listsChecked: 1, entriesPurged: 1 });
    expect(await titles('archived')).toEqual([
      [PURGED_TITLE, null],
      ['Our own title', 'https://image.tmdb.org/t/p/w342/x.jpg'],
    ]);
    expect(await titles('open')).toEqual([['Alien', 'https://image.tmdb.org/t/p/w342/x.jpg']]);
    const purged = (await entries.forList('archived' as ListId)).find(
      (e) => e.item.source === 'tmdb-movie',
    );
    expect(purged).toMatchObject({
      item: { externalId: 'blade runner', subtitle: null },
      snapshotPurgedAt: clock.now(),
    });
  });

  test('is idempotent', async () => {
    await setUp();
    clock.set(new Date(Date.parse('2026-02-01T00:00:00Z') + 200 * day));
    await purge();
    expect((await purge()).entriesPurged).toBe(0);
  });

  test('lists archived before archivedAt existed count from their close', async () => {
    const legacy = { ...listOf('legacy', true), archivedAt: null };
    await lists.save(legacy, null);
    await entries.create(entry('legacy', 'tmdb-movie', 'Heat'));
    clock.set(new Date(closesAt.getTime() + 183 * day));
    expect((await purge()).entriesPurged).toBe(1);
  });
});
