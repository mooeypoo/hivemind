import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId, type RoleId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import type { EntryId } from '../domain/entry.ts';
import { DEFAULT_SCALE, type ListConfig, type Schedule } from '../domain/list.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryLedgerRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeArchiveList } from './archive-list.ts';
import { makeCreateList } from './create-list.ts';
import { makeEditList } from './edit-list.ts';
import { makeGetList } from './get-list.ts';
import { makeListLists } from './list-lists.ts';
import { makeNominate } from './nominate.ts';
import { makeListsPersonalData } from './personal-data.ts';
import { makeScheduleList } from './schedule-list.ts';
import { makeSearchForList } from './search-for-list.ts';
import { makeEntryExists, makeRulesForVoting } from './voting-rules.ts';
import { makeEntriesForRanking, makeRankingContext } from './ranking-services.ts';

const actor = (id: string, opts: { admin?: boolean; roles?: string[] } = {}): Actor => ({
  kind: 'member',
  memberId: id as MemberId,
  displayName: `Member ${id}`,
  roleIds: (opts.roles ?? []) as RoleId[],
  isAdmin: opts.admin ?? false,
});
const admin = actor('admin', { admin: true });
const ada = actor('ada');
const bob = actor('bob');

const config: ListConfig = {
  title: 'Best Sci-Fi Movies',
  slug: 'best-sci-fi',
  description: '',
  itemSource: { kind: 'tmdb-movie' },
  entryMode: 'nominations',
  scale: DEFAULT_SCALE,
  maxNominationsPerMember: 2,
  resultsVisibility: 'live',
  ranking: { strategy: 'bayesian', minVotes: 3 },
  showNominators: true,
  requiredRoleIds: [],
};
const at = (day: number) => new Date(Date.UTC(2026, 2, day));
const schedule: Schedule = { opensAt: at(10), nominationsCloseAt: at(15), closesAt: at(20) };

let clock: FixedClock;
let deps: {
  lists: InMemoryListRepository;
  slugs: InMemorySlugIndex;
  entries: InMemoryEntryRepository;
  ledgers: InMemoryLedgerRepository;
  catalog: FakeCatalog;
  clock: FixedClock;
  ids: SequentialIds;
};

beforeEach(() => {
  clock = new FixedClock(at(1));
  deps = {
    lists: new InMemoryListRepository(),
    slugs: new InMemorySlugIndex(),
    entries: new InMemoryEntryRepository(),
    ledgers: new InMemoryLedgerRepository(),
    catalog: new FakeCatalog(),
    clock,
    ids: new SequentialIds(),
  };
});

const create = (patch: Partial<ListConfig> = {}) =>
  makeCreateList(deps)(admin, { ...config, ...patch });
const scheduleIt = (list: string, s: Schedule = schedule) =>
  makeScheduleList(deps)(admin, { list, schedule: s });
const nominate = (who: Actor, key: string, list = 'best-sci-fi') =>
  makeNominate(deps)(who, { list, key });

/** A published list, open for nominations. */
const openList = async (patch: Partial<ListConfig> = {}) => {
  const created = await create(patch);
  if (!created.ok) throw new Error(created.error.code);
  const scheduled = await scheduleIt(created.value.id);
  if (!scheduled.ok) throw new Error(scheduled.error.code);
  clock.set(at(12));
  return created.value;
};

describe('Admin-only use cases', () => {
  test.each([
    ['anonymous', anonymous, 'unauthenticated'],
    ['a member', ada, 'forbidden'],
  ] as const)('reject %s', async (_, who, kind) => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    const id = created.value.id;
    const results = await Promise.all([
      makeCreateList(deps)(who, { ...config, slug: 'other' }),
      makeEditList(deps)(who, { list: id, edit: { title: 'x' } }),
      makeScheduleList(deps)(who, { list: id, schedule }),
      makeArchiveList(deps)(who, { list: id }),
    ]);
    expect(results.map((result) => !result.ok && result.error.kind)).toEqual([
      kind,
      kind,
      kind,
      kind,
    ]);
  });
});

describe('creating and editing', () => {
  test('creates a draft and refuses a taken slug', async () => {
    const created = await create();
    expect(created.ok && created.value.lifecycle).toBe('draft');
    const again = await create();
    expect(!again.ok && again.error.code).toBe('lists.slug-taken');
  });

  test('checks the item source with the catalog', async () => {
    const result = await create({ itemSource: { kind: 'tmdb-movie' }, entryMode: 'seeded' });
    expect(!result.ok && result.error.code).toBe('catalog.cannot-seed');
  });

  test('renaming the slug frees the old one', async () => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    await makeEditList(deps)(admin, { list: created.value.id, edit: { slug: 'renamed' } });
    expect(await deps.slugs.lookup('best-sci-fi')).toBeNull();
    expect(await deps.slugs.lookup('renamed')).toBe(created.value.id);
  });

  test('archives only after closing', async () => {
    const list = await openList();
    expect((await makeArchiveList(deps)(admin, { list: list.id })).ok).toBe(false);
    clock.set(at(21));
    const archived = await makeArchiveList(deps)(admin, { list: list.id });
    expect(archived.ok && archived.value.lifecycle).toBe('archived');
  });
});

describe('visibility', () => {
  test('drafts are visible only to Admins', async () => {
    await create();
    const forMember = await makeListLists(deps)(ada);
    const forAdmin = await makeListLists(deps)(admin);
    expect(forMember.ok && forMember.value).toEqual([]);
    expect(forAdmin.ok && forAdmin.value.map((list) => list.slug)).toEqual(['best-sci-fi']);
    const detail = await makeGetList(deps)(ada, { list: 'best-sci-fi' });
    expect(!detail.ok && detail.error.code).toBe('lists.not-found');
  });

  test('lists need a signed-in member', async () => {
    expect((await makeListLists(deps)(anonymous)).ok).toBe(false);
  });
});

describe('nominating', () => {
  test('snapshots the catalog item and the nominator', async () => {
    await openList();
    const result = await nominate(ada, '78');
    expect(result.ok && result.value).toMatchObject({
      id: 'tmdb-movie.78',
      item: { title: 'Blade Runner' },
      nominatedBy: 'Member ada',
      isMine: true,
    });
  });

  test('only while the list is open and before nominationsCloseAt', async () => {
    await openList();
    clock.set(at(9));
    expect(!(await nominate(ada, '78')).ok).toBe(true);
    clock.set(at(15));
    const late = await nominate(ada, '78');
    expect(!late.ok && late.error.code).toBe('lists.nominations-closed');
  });

  test('an item can be nominated only once per list', async () => {
    await openList();
    await nominate(ada, '78');
    const again = await nominate(bob, '78');
    expect(!again.ok && again.error.code).toBe('lists.already-nominated');
  });

  test('a duplicate does not use up a nomination', async () => {
    await openList();
    await nominate(ada, '78');
    await nominate(bob, '78');
    expect((await nominate(bob, '603')).ok).toBe(true);
    expect((await nominate(bob, '62')).ok).toBe(true);
  });

  test('each member has a nomination cap', async () => {
    await openList();
    await nominate(ada, '78');
    await nominate(ada, '603');
    const third = await nominate(ada, '62');
    expect(!third.ok && third.error.code).toBe('lists.nomination-cap-reached');
  });

  test('two members nominating the same item at once: one wins, no nomination is lost', async () => {
    await openList();
    const [first, second] = await Promise.all([nominate(ada, '78'), nominate(bob, '78')]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const loser = first.ok ? bob : ada;
    expect((await nominate(loser, '603')).ok).toBe(true);
    expect((await nominate(loser, '62')).ok).toBe(true);
  });

  test('concurrent nominations by one member never exceed the cap', async () => {
    await openList();
    const results = await Promise.all(['78', '603', '62', '1891'].map((id) => nominate(ada, id)));
    expect(results.filter((result) => result.ok)).toHaveLength(2);
    const detail = await makeGetList(deps)(ada, { list: 'best-sci-fi' });
    expect(detail.ok && detail.value.entries).toHaveLength(2);
  });

  test('with unlimited nominations, a member can keep nominating', async () => {
    await openList({ maxNominationsPerMember: null });
    for (const id of ['78', '603', '62', '1891']) {
      expect((await nominate(ada, id)).ok).toBe(true);
    }
    const detail = await makeGetList(deps)(ada, { list: 'best-sci-fi' });
    expect(detail.ok && detail.value.viewer).toEqual({
      canParticipate: true,
      canNominate: true,
      nominationsUsed: 4,
    });
  });

  test('an item must exist in the source', async () => {
    await openList();
    const result = await nominate(ada, '999999');
    expect(!result.ok && result.error.code).toBe('catalog.item-not-found');
  });

  test('a list with a required role is closed to members without it', async () => {
    await openList({ requiredRoleIds: ['r-film' as RoleId] });
    const denied = await nominate(ada, '78');
    expect(!denied.ok && denied.error.code).toBe('lists.role-required');
    expect((await nominate(actor('cy', { roles: ['r-film'] }), '78')).ok).toBe(true);
  });

  test('hides nominators when the list does not show them', async () => {
    await openList({ showNominators: false });
    const result = await nominate(ada, '78');
    expect(result.ok && result.value.nominatedBy).toBeNull();
    expect(result.ok && result.value.isMine).toBe(true);
  });
});

describe('search', () => {
  test('searches the list source while nominations are open', async () => {
    await openList();
    const result = await makeSearchForList(deps)(ada, { list: 'best-sci-fi', query: 'the' });
    expect(result.ok && result.value.map((item) => item.title)).toEqual([
      'The Matrix',
      'The Empire Strikes Back',
    ]);
    clock.set(at(16));
    expect((await makeSearchForList(deps)(ada, { list: 'best-sci-fi', query: 'the' })).ok).toBe(
      false,
    );
  });
});

describe('seeded lists', () => {
  const seeded = {
    slug: 'albums',
    itemSource: { kind: 'preset', presetId: 'albums' },
    entryMode: 'seeded',
  } as const;

  test('get every preset item as an entry when scheduled', async () => {
    await openList(seeded);
    const detail = await makeGetList(deps)(ada, { list: 'albums' });
    expect(detail.ok && detail.value.entries.map((entry) => entry.item.title)).toEqual([
      'Blue',
      'Kid A',
      'OK Computer',
    ]);
    expect(detail.ok && detail.value.entries.every((entry) => entry.nominatedBy === null)).toBe(
      true,
    );
  });

  test('refuse nominations', async () => {
    await openList(seeded);
    const result = await nominate(ada, 'kid a', 'albums');
    expect(!result.ok && result.error.code).toBe('lists.nominations-closed');
  });

  test('a preset pool lets members nominate from the preset', async () => {
    await openList({ slug: 'pool', itemSource: { kind: 'preset', presetId: 'albums' } });
    expect((await nominate(ada, 'blue', 'pool')).ok).toBe(true);
    const outside = await nominate(ada, 'abbey road', 'pool');
    expect(!outside.ok && outside.error.code).toBe('catalog.item-not-found');
  });
});

describe('personal data', () => {
  const personalData = () => makeListsPersonalData(deps);

  test('exports the member nominations', async () => {
    await openList();
    await nominate(ada, '78');
    expect(await personalData().exportFor('ada' as MemberId)).toEqual({
      nominations: [
        {
          listId: 'id-1',
          entryId: 'tmdb-movie.78',
          title: 'Blade Runner',
          nominatedAt: at(12).toISOString(),
        },
      ],
    });
  });

  test('erasure keeps the entries but removes the nominator', async () => {
    await openList();
    await nominate(ada, '78');
    await nominate(bob, '603');
    expect((await personalData().eraseFor('ada' as MemberId)).ok).toBe(true);

    const detail = await makeGetList(deps)(admin, { list: 'best-sci-fi' });
    expect(
      detail.ok && detail.value.entries.map((entry) => [entry.item.title, entry.nominatedBy]),
    ).toEqual([
      ['Blade Runner', null],
      ['The Matrix', 'Member bob'],
    ]);
    expect(await personalData().exportFor('ada' as MemberId)).toEqual({ nominations: [] });
  });
});

describe('services for voting', () => {
  test('report the scale, required roles and whether the list is open', async () => {
    const list = await openList({ scale: { min: 0, max: 5 }, requiredRoleIds: ['r1' as RoleId] });
    const rules = makeRulesForVoting(deps);
    expect(await rules('best-sci-fi')).toEqual({
      ok: true,
      value: { listId: list.id, isOpen: true, scale: { min: 0, max: 5 }, requiredRoleIds: ['r1'] },
    });
    clock.set(at(20));
    const closed = await rules(list.id);
    expect(closed.ok && closed.value.isOpen).toBe(false);
  });

  test('treat drafts as not found', async () => {
    await create();
    const result = await makeRulesForVoting(deps)('best-sci-fi');
    expect(!result.ok && result.error.code).toBe('lists.not-found');
  });

  test('say whether an entry exists in a list', async () => {
    const list = await openList();
    await nominate(ada, '78');
    const exists = makeEntryExists(deps);
    expect(await exists(list.id, 'tmdb-movie.78' as EntryId)).toBe(true);
    expect(await exists(list.id, 'tmdb-movie.603' as EntryId)).toBe(false);
  });
});

describe('services for ranking', () => {
  test('report visibility, close time, strategy and current entry ids', async () => {
    const list = await openList({ resultsVisibility: 'after-close' });
    await nominate(ada, '78');
    expect(await makeRankingContext(deps)('best-sci-fi')).toEqual({
      ok: true,
      value: {
        listId: list.id,
        resultsVisibility: 'after-close',
        closesAt: at(20),
        strategy: 'bayesian',
        minVotes: 3,
        entryIds: ['tmdb-movie.78'],
      },
    });
    expect((await makeEntriesForRanking(deps)(list.id)).map((entry) => entry.item.title)).toEqual([
      'Blade Runner',
    ]);
  });
});
