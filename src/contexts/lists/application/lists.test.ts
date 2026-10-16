import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId, type RoleId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { nominationToken, type EntryId } from '../domain/entry.ts';
import { DEFAULT_SCALE, type ListConfig, type Schedule } from '../domain/list.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryLedgerRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeArchiveList } from './archive-list.ts';
import { makeExportForBackup, makeRestoreFromBackup } from './backup.ts';
import { makeCloseVoting, makeSetVisibility } from './close-voting.ts';
import { makeSetScoreVisibility } from './score-visibility.ts';
import { makeCreateList } from './create-list.ts';
import { makeEditList } from './edit-list.ts';
import { makeGetList, makeGetSharePreview } from './get-list.ts';
import { makeListLists } from './list-lists.ts';
import { makeNominate } from './nominate.ts';
import { makeWithdrawNomination } from './withdraw-nomination.ts';
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
  scoreVisibility: 'private',
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

const withdraw = async (who: Actor, entryId = 'tmdb-movie.78') => {
  const list = await deps.slugs.lookup('best-sci-fi');
  if (list === null) throw new Error('fixture');
  const entry = await deps.entries.get(list, entryId as EntryId);
  if (entry === null) throw new Error('fixture');
  return makeWithdrawNomination(deps)(who, { list, entryId, token: nominationToken(entry.value) });
};

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
  test.each([1, 12])('changes an unused published list source on day %s', async (day) => {
    const list = await openList();
    clock.set(at(day));
    const edited = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'freeform' } },
    });
    expect(edited.ok && edited.value.itemSource).toEqual({ kind: 'freeform' });
    const detail = await makeGetList(deps)(admin, { list: list.id });
    expect(detail.ok && detail.value.itemSourceEditable).toBe(true);
  });

  test('active and withdrawn entries both lock the item source', async () => {
    const list = await openList();
    await nominate(ada, '78');
    for (const withdrawn of [false, true]) {
      if (withdrawn) expect((await withdraw(ada)).ok).toBe(true);
      const edited = await makeEditList(deps)(admin, {
        list: list.id,
        edit: { itemSource: { kind: 'freeform' } },
      });
      expect(!edited.ok && edited.error.code).toBe('lists.source-has-entries');
      const detail = await makeGetList(deps)(admin, { list: list.id });
      expect(detail.ok && detail.value.itemSourceEditable).toBe(false);
    }
  });

  test('a source edit winning during catalog resolution rejects the old-source nomination', async () => {
    const list = await openList();
    const resolve = deps.catalog.resolve.bind(deps.catalog);
    deps.catalog.resolve = async (source, key) => {
      const item = await resolve(source, key);
      const edit = await makeEditList(deps)(admin, {
        list: list.id,
        edit: { itemSource: { kind: 'freeform' } },
      });
      expect(edit.ok).toBe(true);
      return item;
    };
    const nominated = await nominate(ada, '78');
    expect(!nominated.ok && nominated.error.kind).toBe('conflict');
    expect(await deps.entries.forList(list.id)).toEqual([]);
    expect(await deps.ledgers.forList(list.id)).toEqual([]);
    expect(await deps.lists.hasEntryWrites(list.id)).toBe(false);
  });

  test('an admitted nomination blocks source editing until its entry exists', async () => {
    const list = await openList();
    const createEntry = deps.entries.create;
    deps.entries.create = async (entry) => {
      const edit = await makeEditList(deps)(admin, {
        list: list.id,
        edit: { itemSource: { kind: 'freeform' } },
      });
      expect(!edit.ok && edit.error.code).toBe('lists.source-write-in-progress');
      return createEntry(entry);
    };
    expect((await nominate(ada, '78')).ok).toBe(true);
    expect(await deps.lists.hasEntryWrites(list.id)).toBe(false);
  });

  test('a rejected nomination does not lock an empty list source', async () => {
    const list = await openList();
    deps.ledgers.save = () => Promise.resolve(false);
    expect((await nominate(ada, '78')).ok).toBe(false);
    expect(await deps.lists.hasEntryWrites(list.id)).toBe(false);
    const edit = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'freeform' } },
    });
    expect(edit.ok).toBe(true);
  });

  test('uncertain adapter failures retain protection rather than admit a conflicting source', async () => {
    const list = await openList();
    deps.entries.create = () => Promise.reject(new Error('Entry write interrupted'));
    await expect(nominate(ada, '78')).rejects.toThrow('Entry write interrupted');
    expect(await deps.lists.hasEntryWrites(list.id)).toBe(true);
    const edit = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'freeform' } },
    });
    expect(!edit.ok && edit.error.code).toBe('lists.source-write-in-progress');
  });

  test('a nomination admitted after the emptiness checks invalidates the source edit ETag', async () => {
    const list = await openList();
    const forList = deps.entries.forList;
    let injectNomination = true;
    deps.entries.forList = async (id) => {
      const entries = await forList(id);
      if (injectNomination) {
        injectNomination = false;
        expect((await nominate(ada, '78')).ok).toBe(true);
      }
      return entries;
    };
    const edit = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'freeform' } },
    });
    expect(!edit.ok && edit.error.code).toBe('lists.source-has-entries');
    expect((await deps.lists.get(list.id))?.value.config.itemSource).toEqual({
      kind: 'tmdb-movie',
    });
  });

  test('unavailable sources are rejected and unchanged source fields stay legal with entries', async () => {
    const list = await openList();
    const unavailable = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'unavailable' } },
    });
    expect(!unavailable.ok && unavailable.error.code).toBe('catalog.source-unavailable');
    await nominate(ada, '78');
    const unchanged = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: config.itemSource, description: 'Updated' },
    });
    expect(unchanged.ok).toBe(true);
    const member = await makeGetList(deps)(ada, { list: list.id });
    expect(member.ok && member.value.itemSourceEditable).toBe(false);
  });

  test('source changes never unlock finished or published seeded lists', async () => {
    const list = await openList();
    clock.set(at(21));
    const closed = await makeEditList(deps)(admin, {
      list: list.id,
      edit: { itemSource: { kind: 'freeform' } },
    });
    expect(!closed.ok && closed.error.code).toBe('lists.locked');
    await makeArchiveList(deps)(admin, { list: list.id });
    const archived = await makeGetList(deps)(admin, { list: list.id });
    expect(archived.ok && archived.value.itemSourceEditable).toBe(false);

    clock.set(at(1));
    deps.catalog.seedItems = () => Promise.resolve({ ok: true, value: [] });
    const seeded = await openList({
      slug: 'empty-seeded',
      itemSource: { kind: 'preset', presetId: 'albums' },
      entryMode: 'seeded',
    });
    const edit = await makeEditList(deps)(admin, {
      list: seeded.id,
      edit: { itemSource: { kind: 'preset', presetId: 'other' } },
    });
    expect(!edit.ok && edit.error.details).toEqual(['itemSource']);
    const detail = await makeGetList(deps)(admin, { list: seeded.id });
    expect(detail.ok && detail.value.itemSourceEditable).toBe(false);
  });

  test('publication and restoration protect their entry writes from source edits', async () => {
    const created = await create({
      itemSource: { kind: 'preset', presetId: 'albums' },
      entryMode: 'seeded',
    });
    if (!created.ok) throw new Error('fixture');
    const createEntry = deps.entries.create;
    deps.entries.create = async (entry) => {
      const edit = await makeEditList(deps)(admin, {
        list: entry.listId,
        edit: { itemSource: { kind: 'freeform' }, entryMode: 'nominations' },
      });
      expect(!edit.ok && edit.error.code).toBe('lists.source-write-in-progress');
      return createEntry(entry);
    };
    expect((await scheduleIt(created.value.id)).ok).toBe(true);
    const exported = await makeExportForBackup(deps)(created.value.id);
    if (!exported.ok || exported.value[0] === undefined) throw new Error('fixture');
    const restored = await makeRestoreFromBackup(deps)(exported.value[0].backup, {
      keepMember: () => Promise.resolve(true),
    });
    expect(restored.ok).toBe(true);
    expect(await deps.lists.hasEntryWrites(created.value.id)).toBe(false);
    if (restored.ok) expect(await deps.lists.hasEntryWrites(restored.value.listId)).toBe(false);
  });

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

  test('lifting a published cap applies immediately and cannot be reversed', async () => {
    await openList({ maxNominationsPerMember: 2 });
    await nominate(ada, '78');
    await nominate(ada, '603');

    const lifted = await makeEditList(deps)(admin, {
      list: 'best-sci-fi',
      edit: { maxNominationsPerMember: null },
    });
    expect(lifted.ok && lifted.value.maxNominationsPerMember).toBeNull();
    expect((await nominate(ada, '62')).ok).toBe(true);

    const restored = await makeEditList(deps)(admin, {
      list: 'best-sci-fi',
      edit: { maxNominationsPerMember: 2 },
    });
    expect(!restored.ok && restored.error.details).toEqual(['maxNominationsPerMember']);
  });

  test('renaming the slug frees the old one', async () => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    await makeEditList(deps)(admin, { list: created.value.id, edit: { slug: 'renamed' } });
    expect(await deps.slugs.lookup('best-sci-fi')).toBeNull();
    expect(await deps.slugs.lookup('renamed')).toBe(created.value.id);
  });

  test('archives a published list at any time, which ends voting', async () => {
    const list = await openList();
    const archived = await makeArchiveList(deps)(admin, { list: list.id });
    expect(archived.ok && archived.value.lifecycle).toBe('archived');
    const rules = await makeRulesForVoting(deps)(list.id, { isAdmin: false });
    expect(rules.ok && rules.value.isOpen).toBe(false);
    const ranking = await makeRankingContext(deps)(list.id, { isAdmin: false });
    expect(ranking.ok && ranking.value.votingEnded).toBe(true);
  });
});

describe('visibility', () => {
  test('anonymous share previews expose only published non-hidden list titles and slugs', async () => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    const preview = makeGetSharePreview(deps);
    expect(await preview({ list: 'best-sci-fi' })).toBeNull();
    expect(await preview({ list: 'missing' })).toBeNull();
    await scheduleIt(created.value.id);
    const expected = { title: config.title, slug: config.slug };
    expect(await preview({ list: config.slug })).toEqual(expected);
    expect(await preview({ list: created.value.id })).toEqual(expected);
    await makeSetVisibility(deps)(admin, { list: created.value.id, visibility: 'hidden' });
    expect(await preview({ list: config.slug })).toBeNull();
    expect(await preview({ list: created.value.id })).toBeNull();
    const detail = await makeGetList(deps)(anonymous, { list: config.slug });
    expect(!detail.ok && detail.error.kind).toBe('unauthenticated');
  });

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
  test.each([1, null])(
    'withdrawal refunds the allowance with cap %s, even after another member restores it',
    async (cap) => {
      const list = await openList({ maxNominationsPerMember: cap });
      await nominate(ada, '78');
      expect((await withdraw(ada)).ok).toBe(true);
      expect((await nominate(bob, '78')).ok).toBe(true);
      const detail = await makeGetList(deps)(ada, { list: list.id });
      expect(detail.ok && detail.value.viewer.nominationsUsed).toBe(0);
      const index = await makeListLists(deps)(ada);
      expect(index.ok && index.value[0]?.viewer.nominationsUsed).toBe(0);
      expect((await nominate(ada, '603')).ok).toBe(true);
    },
  );

  test('only the original nominator can withdraw, including when names are hidden', async () => {
    await openList({ showNominators: false });
    await nominate(ada, '78');
    expect((await withdraw(anonymous)).ok).toBe(false);
    expect((await withdraw(bob)).ok).toBe(false);
    expect((await withdraw(admin)).ok).toBe(false);
    expect((await withdraw(ada)).ok).toBe(true);
  });

  test.each([9, 15, 20])(
    'withdrawal is refused outside the nomination window, day %s',
    async (day) => {
      await openList();
      await nominate(ada, '78');
      clock.set(at(day));
      const result = await withdraw(ada);
      expect(!result.ok && result.error.code).toBe('lists.nominations-closed');
    },
  );

  test('withdrawal is refused after archiving and does not require a participation role', async () => {
    const list = await openList({ requiredRoleIds: ['r-film' as RoleId] });
    await nominate(actor('ada', { roles: ['r-film'] }), '78');
    expect((await withdraw(ada)).ok).toBe(true);
    await nominate(actor('ada', { roles: ['r-film'] }), '78');
    await makeArchiveList(deps)(admin, { list: list.id });
    expect((await withdraw(ada)).ok).toBe(false);
  });

  test('retrying withdrawal is harmless but an old token cannot withdraw a re-nomination', async () => {
    const list = await openList({ maxNominationsPerMember: 1 });
    const first = await nominate(ada, '78');
    if (!first.ok || first.value.withdrawalToken === null) throw new Error('fixture');
    const input = { list: list.id, entryId: first.value.id, token: first.value.withdrawalToken };
    expect((await makeWithdrawNomination(deps)(ada, input)).ok).toBe(true);
    expect((await makeWithdrawNomination(deps)(ada, input)).ok).toBe(true);
    expect((await nominate(ada, '78')).ok).toBe(true);
    const stale = await makeWithdrawNomination(deps)(ada, input);
    expect(!stale.ok && stale.error.code).toBe('lists.conflict');
    const detail = await makeGetList(deps)(ada, { list: list.id });
    expect(detail.ok && detail.value.viewer.nominationsUsed).toBe(1);
  });

  test('competing re-nominations have one winner and no loser loses a slot', async () => {
    await openList({ maxNominationsPerMember: 1 });
    await nominate(ada, '78');
    await withdraw(ada);
    const results = await Promise.all([nominate(ada, '78'), nominate(bob, '78')]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const loser = results[0].ok ? bob : ada;
    expect((await nominate(loser, '603')).ok).toBe(true);
  });

  test('withdrawal retries an entry write conflict once and reports a persistent conflict', async () => {
    await openList();
    await nominate(ada, '78');
    const save = deps.entries.save;
    let attempts = 0;
    deps.entries.save = (...args) => (++attempts === 1 ? Promise.resolve(false) : save(...args));
    expect((await withdraw(ada)).ok).toBe(true);
    expect(attempts).toBe(2);
    deps.entries.save = save;
    await nominate(ada, '78');
    deps.entries.save = () => Promise.resolve(false);
    const refused = await withdraw(ada);
    expect(!refused.ok && refused.error.code).toBe('lists.conflict');
  });

  test('withdrawal hides an entry, refunds the slot and allows re-nomination with the same id', async () => {
    const list = await openList({ maxNominationsPerMember: 1 });
    const nominated = await nominate(ada, '78');
    if (!nominated.ok || nominated.value.withdrawalToken === null) throw new Error('fixture');
    expect((await nominate(ada, '603')).ok).toBe(false);
    expect(
      (
        await makeWithdrawNomination(deps)(ada, {
          list: list.id,
          entryId: nominated.value.id,
          token: nominated.value.withdrawalToken,
        })
      ).ok,
    ).toBe(true);
    const detail = await makeGetList(deps)(ada, { list: list.id });
    expect(detail.ok && detail.value.entries).toEqual([]);
    expect(detail.ok && detail.value.viewer.nominationsUsed).toBe(0);
    expect(await makeEntryExists(deps)(list.id, nominated.value.id)).toBe(false);
    expect((await nominate(ada, '603')).ok).toBe(true);
    const restored = await nominate(bob, '78');
    expect(restored.ok && restored.value).toMatchObject({
      id: nominated.value.id,
      nominatedBy: 'Member bob',
      isMine: true,
    });
    expect(await makeEntryExists(deps)(list.id, nominated.value.id)).toBe(true);
    const oldOwner = await makeGetList(deps)(ada, { list: list.id });
    expect(oldOwner.ok && oldOwner.value.viewer.nominationsUsed).toBe(1);
  });

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

  test('an Admin can lift the active nomination cap and members can continue nominating', async () => {
    await openList({ maxNominationsPerMember: 2 });
    await nominate(ada, '78');
    await nominate(ada, '603');
    const lifted = await makeEditList(deps)(admin, {
      list: 'best-sci-fi',
      edit: { maxNominationsPerMember: null },
    });
    expect(lifted.ok && lifted.value.maxNominationsPerMember).toBeNull();
    expect((await nominate(ada, '62')).ok).toBe(true);
    expect((await nominate(ada, '1891')).ok).toBe(true);
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

  test('withdrawn reservation records remain exportable and erasure does not anonymise a new nominator', async () => {
    const list = await openList();
    await nominate(ada, '78');
    await withdraw(ada);
    await nominate(bob, '78');
    const exported = await personalData().exportFor('ada' as MemberId);
    expect(exported.nominations).toEqual([]);
    expect(exported.nominationRecords[0]?.entryIds).toEqual(['tmdb-movie.78']);
    expect((await personalData().eraseFor('ada' as MemberId)).ok).toBe(true);
    const detail = await makeGetList(deps)(bob, { list: list.id });
    expect(detail.ok && detail.value.entries[0]?.nominatedBy).toBe('Member bob');
    expect(await personalData().exportFor('ada' as MemberId)).toEqual({
      nominations: [],
      nominationRecords: [],
    });
  });

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
      nominationRecords: await deps.ledgers.forMember('ada' as MemberId),
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
    expect(await personalData().exportFor('ada' as MemberId)).toEqual({
      nominations: [],
      nominationRecords: [],
    });
  });
});

describe('services for voting', () => {
  test('report the scale, required roles and whether the list is open', async () => {
    const list = await openList({ scale: { min: 0, max: 5 }, requiredRoleIds: ['r1' as RoleId] });
    const rules = makeRulesForVoting(deps);
    expect(await rules('best-sci-fi', { isAdmin: false })).toEqual({
      ok: true,
      value: {
        listId: list.id,
        writeRevision: null,
        isOpen: true,
        scale: { min: 0, max: 5 },
        requiredRoleIds: ['r1'],
        scoresPublic: false,
        namesWithScores: false,
      },
    });
    clock.set(at(20));
    const closed = await rules(list.id, { isAdmin: false });
    expect(closed.ok && closed.value.isOpen).toBe(false);
  });

  test('treat drafts as not found', async () => {
    await create();
    const result = await makeRulesForVoting(deps)('best-sci-fi', { isAdmin: false });
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
    expect(await makeRankingContext(deps)('best-sci-fi', { isAdmin: false })).toEqual({
      ok: true,
      value: {
        listId: list.id,
        writeRevision: null,
        resultsVisibility: 'after-close',
        votingEnded: false,
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

describe('open-ended lists and closing voting', () => {
  test('a list without an end date stays open until an Admin closes voting', async () => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    await scheduleIt(created.value.id, { ...schedule, closesAt: null });
    clock.set(new Date('2030-01-01T00:00:00Z'));
    expect((await nominate(ada, '78')).ok).toBe(false); // nominations closed on day 15
    const rules = await makeRulesForVoting(deps)('best-sci-fi', { isAdmin: false });
    expect(rules.ok && rules.value.isOpen).toBe(true);

    expect((await makeCloseVoting(deps)(ada, { list: 'best-sci-fi' })).ok).toBe(false);
    const closed = await makeCloseVoting(deps)(admin, { list: 'best-sci-fi' });
    expect(closed.ok && closed.value.lifecycle).toBe('closed');
    const ranking = await makeRankingContext(deps)('best-sci-fi', { isAdmin: false });
    expect(ranking.ok && ranking.value.votingEnded).toBe(true);
  });
});

describe('hidden lists', () => {
  const hide = (visibility: 'public' | 'hidden') =>
    makeSetVisibility(deps)(admin, { list: 'best-sci-fi', visibility });

  test('exist only for Admins, everywhere', async () => {
    await openList();
    await nominate(ada, '78');
    expect((await hide('hidden')).ok).toBe(true);

    const index = await makeListLists(deps)(ada);
    expect(index.ok && index.value).toEqual([]);
    for (const result of [
      await makeGetList(deps)(ada, { list: 'best-sci-fi' }),
      await nominate(ada, '603'),
      await makeSearchForList(deps)(ada, { list: 'best-sci-fi', query: 'the' }),
      await makeRulesForVoting(deps)('best-sci-fi', { isAdmin: false }),
      await makeRankingContext(deps)('best-sci-fi', { isAdmin: false }),
    ]) {
      expect(!result.ok && result.error.code).toBe('lists.not-found');
    }

    const adminView = await makeGetList(deps)(admin, { list: 'best-sci-fi' });
    expect(adminView.ok && adminView.value.visibility).toBe('hidden');
    expect(adminView.ok && adminView.value.entries).toHaveLength(1);
  });

  test('can be made public again, and only by Admins, even when archived', async () => {
    const list = await openList();
    await makeArchiveList(deps)(admin, { list: list.id });
    expect((await makeSetVisibility(deps)(ada, { list: list.id, visibility: 'hidden' })).ok).toBe(
      false,
    );
    expect((await hide('hidden')).ok).toBe(true);
    const shown = await hide('public');
    expect(shown.ok && shown.value.visibility).toBe('public');
    expect((await makeGetList(deps)(ada, { list: 'best-sci-fi' })).ok).toBe(true);
  });
});

describe('backups', () => {
  const exportBackup = (ref: string | null) => makeExportForBackup(deps)(ref);
  const restore = (
    backup: Parameters<ReturnType<typeof makeRestoreFromBackup>>[0],
    keep: (memberId: string) => Promise<boolean> = () => Promise.resolve(true),
  ) => makeRestoreFromBackup(deps)(backup, { keepMember: keep });

  test('export one list (even hidden or draft) or all of them', async () => {
    await openList();
    await nominate(ada, '78');
    await create({ slug: 'second', title: 'Second' });
    const one = await exportBackup('best-sci-fi');
    expect(one.ok && one.value).toHaveLength(1);
    expect(
      one.ok && one.value[0]?.backup.entries.map((e) => [e.item.title, e.nominatedBy?.displayName]),
    ).toEqual([['Blade Runner', 'Member ada']]);
    expect(one.ok && one.value[0]?.backup.nominators).toEqual([
      { memberId: 'ada', entryIds: ['tmdb-movie.78'] },
    ]);
    const all = await exportBackup(null);
    expect(all.ok && all.value.map((x) => x.backup.list.config.slug)).toEqual([
      'best-sci-fi',
      'second',
    ]);
  });

  test('restore never overwrites: a taken address gets a new one, hidden for review', async () => {
    await openList();
    await nominate(ada, '78');
    const exported = await exportBackup('best-sci-fi');
    if (!exported.ok || exported.value[0] === undefined) throw new Error('fixture');
    const restored = await restore(exported.value[0].backup);
    expect(restored.ok && restored.value).toMatchObject({
      slug: 'best-sci-fi-2',
      renamed: true,
      hidden: true,
      entries: 1,
    });
    const original = await makeGetList(deps)(admin, { list: 'best-sci-fi' });
    expect(original.ok && original.value.visibility).toBe('public');
    const copy = await makeGetList(deps)(admin, { list: 'best-sci-fi-2' });
    expect(copy.ok && copy.value.entries.map((e) => e.nominatedBy)).toEqual(['Member ada']);
  });

  test('restoring into an empty site keeps the original address and visibility', async () => {
    await openList();
    const exported = await exportBackup('best-sci-fi');
    if (!exported.ok || exported.value[0] === undefined) throw new Error('fixture');
    deps.lists = new InMemoryListRepository();
    deps.slugs = new InMemorySlugIndex();
    deps.entries = new InMemoryEntryRepository();
    const restored = await restore(exported.value[0].backup);
    expect(restored.ok && restored.value).toMatchObject({
      slug: 'best-sci-fi',
      renamed: false,
      hidden: false,
    });
  });

  test('members who must not be kept lose their name and nomination record, not the entry', async () => {
    await openList();
    await nominate(ada, '78');
    await nominate(bob, '603');
    const exported = await exportBackup('best-sci-fi');
    if (!exported.ok || exported.value[0] === undefined) throw new Error('fixture');
    const restored = await restore(exported.value[0].backup, (id) => Promise.resolve(id !== 'ada'));
    expect(restored.ok && restored.value.membersLeftOut).toEqual(['ada']);
    if (!restored.ok) throw new Error('restore');
    const copy = await makeGetList(deps)(admin, { list: restored.value.slug });
    expect(copy.ok && copy.value.entries.map((e) => [e.item.title, e.nominatedBy])).toEqual([
      ['Blade Runner', null],
      ['The Matrix', 'Member bob'],
    ]);
    expect((await deps.ledgers.forList(restored.value.listId)).map((l) => l.memberId)).toEqual([
      'bob',
    ]);
  });

  test('an invalid list in a backup is refused with its problems', async () => {
    await openList();
    const exported = await exportBackup('best-sci-fi');
    if (!exported.ok || exported.value[0] === undefined) throw new Error('fixture');
    const backup = exported.value[0].backup;
    const broken = {
      ...backup,
      list: { ...backup.list, config: { ...backup.list.config, title: ' ' } },
    };
    const result = await restore(broken);
    expect(!result.ok && result.error.code).toBe('lists.invalid-backup');
  });
});

describe('public scores', () => {
  const rules = () => makeRulesForVoting(deps)('best-sci-fi', { isAdmin: false });

  test('only Admins choose, and published lists can only go private', async () => {
    const created = await create();
    if (!created.ok) throw new Error('fixture');
    expect(
      (await makeSetScoreVisibility(deps)(ada, { list: 'best-sci-fi', scoreVisibility: 'public' }))
        .ok,
    ).toBe(false);
    const made = await makeSetScoreVisibility(deps)(admin, {
      list: 'best-sci-fi',
      scoreVisibility: 'public',
    });
    expect(made.ok && made.value.scoreVisibility).toBe('public');
    await scheduleIt(created.value.id);
    clock.set(at(12));
    const toPrivate = await makeSetScoreVisibility(deps)(admin, {
      list: 'best-sci-fi',
      scoreVisibility: 'private',
    });
    expect(toPrivate.ok && toPrivate.value.scoreVisibility).toBe('private');
    const back = await makeSetScoreVisibility(deps)(admin, {
      list: 'best-sci-fi',
      scoreVisibility: 'public',
    });
    expect(!back.ok && back.error.code).toBe('lists.scores-private-only');
  });

  test('public scores show with live results, and only at the close when results wait', async () => {
    await openList({ scoreVisibility: 'public' });
    let r = await rules();
    expect(r.ok && [r.value.scoresPublic, r.value.namesWithScores]).toEqual([true, true]);

    await makeSetScoreVisibility(deps)(admin, { list: 'best-sci-fi', scoreVisibility: 'private' });
    r = await rules();
    expect(r.ok && [r.value.scoresPublic, r.value.namesWithScores]).toEqual([false, false]);
  });

  test('with results after close, public scores wait for the close', async () => {
    await openList({ scoreVisibility: 'public', resultsVisibility: 'after-close' });
    let r = await rules();
    expect(r.ok && [r.value.scoresPublic, r.value.namesWithScores]).toEqual([false, true]);
    clock.set(at(20));
    r = await rules();
    expect(r.ok && r.value.scoresPublic).toBe(true);
  });
});
