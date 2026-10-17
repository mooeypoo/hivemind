import { beforeEach, expect, test, vi } from 'vitest';
import { anonymous, ok, type MemberActor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { LIST_DEFAULTS, type ListId } from '../domain/list.ts';
import { nominationToken } from '../domain/entry.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryLedgerRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeGetListActivity, makeAnonymiseActivity } from './activity.ts';
import { makeCreateList } from './create-list.ts';
import { makeEditList } from './edit-list.ts';
import { makeArchiveList } from './archive-list.ts';
import { makeCloseVoting, makeSetVisibility } from './close-voting.ts';
import { makeSetScoreVisibility } from './score-visibility.ts';
import { makeScheduleList } from './schedule-list.ts';
import { makeNominate } from './nominate.ts';
import { makeSetEntryAside } from './set-entry-aside.ts';
import { makeGetList } from './get-list.ts';
import { makeListsPersonalData } from './personal-data.ts';
import { makeExportForBackup, makeRestoreFromBackup } from './backup.ts';
import {
  makeFinishEntryDeletion,
  makePrepareEntryDeletion,
  makeWithEntryDeletion,
} from './delete-entry.ts';
import { makePrepareListDeletion, makeFinishListDeletion } from './delete-list.ts';

const admin: MemberActor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Alex',
  roleIds: [],
  isAdmin: true,
};
const member: MemberActor = {
  ...admin,
  memberId: 'member' as MemberId,
  displayName: 'Member',
  isAdmin: false,
};
const at = (value: string) => new Date(`${value}T12:00:00Z`);
const setup = () => ({
  lists: new InMemoryListRepository(),
  slugs: new InMemorySlugIndex(),
  entries: new InMemoryEntryRepository(),
  ledgers: new InMemoryLedgerRepository(),
  clock: new FixedClock(at('2026-01-01')),
  ids: new SequentialIds(),
  catalog: new FakeCatalog(),
});
let deps: ReturnType<typeof setup>;
let id: ListId;
beforeEach(async () => {
  deps = setup();
  const created = await makeCreateList(deps)(admin, {
    ...LIST_DEFAULTS,
    title: 'Shared decisions',
    slug: 'decisions',
    itemSource: { kind: 'freeform' },
  });
  if (!created.ok) throw new Error('fixture');
  id = created.value.id;
});
const history = () => makeGetListActivity(deps)(admin, { list: id });
const entries = async () => {
  expect(
    (
      await makeScheduleList(deps)(admin, {
        list: id,
        schedule: { opensAt: deps.clock.now(), nominationsCloseAt: null, closesAt: null },
      })
    ).ok,
  ).toBe(true);
  const nominated = await makeNominate(deps)(member, { list: id, key: 'An item' });
  if (!nominated.ok) throw new Error('fixture');
  return nominated.value;
};
const moderate = async () => {
  const entry = await entries();
  const stored = await deps.entries.get(id, entry.id);
  if (stored === null) throw new Error('fixture');
  const result = await makeSetEntryAside(deps)(admin, {
    list: id,
    entryId: entry.id,
    token: nominationToken(stored.value),
    expectedReason: null,
    reason: 'Do not copy this explanation into history',
  });
  expect(result.ok).toBe(true);
  return stored.value;
};

test('history is admin-only, missing lists are not found, and ordinary DTOs omit attribution', async () => {
  expect(await makeGetListActivity(deps)(anonymous, { list: id })).toMatchObject({
    ok: false,
    error: { kind: 'unauthenticated' },
  });
  expect(await makeGetListActivity(deps)(member, { list: id })).toMatchObject({
    ok: false,
    error: { kind: 'forbidden' },
  });
  expect(await makeGetListActivity(deps)(admin, { list: 'missing' })).toMatchObject({
    ok: false,
    error: { kind: 'not-found' },
  });
  await moderate();
  const ordinary = await makeGetList(deps)(member, { list: id });
  expect(ordinary.ok && ordinary.value).not.toHaveProperty('createdBy');
  expect(ordinary.ok && ordinary.value.entries[0]).not.toHaveProperty('moderation');
  const detail = await makeGetList(deps)(admin, { list: id });
  expect(detail.ok && detail.value.createdBy).toBe('Alex');
  expect(detail.ok && detail.value.entries[0]?.moderation?.adminName).toBe('Alex');
});

test('successful changes are recorded atomically and failed writes never create phantom events', async () => {
  await makeEditList(deps)(admin, { list: id, edit: { maxNominationsPerMember: 3 } });
  const save = deps.lists.save.bind(deps.lists);
  const spy = vi.spyOn(deps.lists, 'save').mockResolvedValue(false);
  expect(
    (await makeEditList(deps)(admin, { list: id, edit: { description: 'Not saved' } })).ok,
  ).toBe(false);
  let result = await history();
  expect(result.ok && result.value.map((event) => event.action)).toEqual([
    'settings-edited',
    'created',
  ]);
  spy.mockImplementationOnce(() => Promise.resolve(false)).mockImplementation(save);
  expect(
    (
      await makeEditList(deps)(admin, {
        list: id,
        edit: { description: 'New prose', maxNominationsPerMember: null },
      })
    ).ok,
  ).toBe(true);
  result = await history();
  expect(
    result.ok && result.value.filter((event) => event.action === 'settings-edited'),
  ).toHaveLength(2);
  const text = JSON.stringify(result);
  expect(text).not.toContain('New prose');
  expect(
    result.ok && result.value.find((event) => event.action === 'settings-edited')?.changes,
  ).toContainEqual({ field: 'maxNominationsPerMember', before: '3', after: 'null' });
  spy.mockRestore();
});

test('no-op saves and moderation retries do not add activity; prose never enters events', async () => {
  await makeEditList(deps)(admin, { list: id, edit: { description: '' } });
  const entry = await moderate();
  const input = {
    list: id,
    entryId: entry.id,
    token: nominationToken(entry),
    expectedReason: 'Do not copy this explanation into history',
    reason: 'Do not copy this explanation into history',
  };
  await makeSetEntryAside(deps)(admin, input);
  let result = await history();
  expect(
    result.ok && result.value.filter((event) => event.action === 'entry-set-aside'),
  ).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain(input.reason);
  await makeSetEntryAside(deps)(admin, {
    ...input,
    reason: 'Another private-to-history explanation',
  });

  await makeSetEntryAside(deps)(admin, {
    ...input,
    expectedReason: 'Another private-to-history explanation',
    reason: null,
  });
  result = await history();
  expect(result.ok && result.value.map((event) => event.action)).toEqual(
    expect.arrayContaining(['explanation-edited', 'entry-returned']),
  );
});

test('list status and score privacy actions retain named, structured decisions', async () => {
  expect(
    (await makeEditList(deps)(admin, { list: id, edit: { scoreVisibility: 'public' } })).ok,
  ).toBe(true);
  await entries();
  expect((await makeSetVisibility(deps)(admin, { list: id, visibility: 'hidden' })).ok).toBe(true);
  expect(
    (await makeSetScoreVisibility(deps)(admin, { list: id, scoreVisibility: 'private' })).ok,
  ).toBe(true);
  expect((await makeCloseVoting(deps)(admin, { list: id })).ok).toBe(true);
  expect((await makeArchiveList(deps)(admin, { list: id })).ok).toBe(true);
  const result = await history();
  expect(result.ok && result.value.map((event) => event.action)).toEqual(
    expect.arrayContaining([
      'created',
      'settings-edited',
      'published',
      'visibility-changed',
      'score-privacy-changed',
      'voting-closed',
      'archived',
    ]),
  );
  expect(result.ok && result.value.every((event) => event.adminName === 'Alex')).toBe(true);
});

test('read-time expiry hides names immediately; the job removes both identity fields without changing settings version', async () => {
  await moderate();
  deps.clock.set(new Date('2027-01-01T11:59:59.999Z'));
  const beforeExpiry = await history();
  expect(beforeExpiry.ok && beforeExpiry.value.every((event) => event.adminName === 'Alex')).toBe(
    true,
  );
  deps.clock.set(at('2027-01-01'));
  const result = await history();
  expect(result.ok && result.value.every((event) => event.adminName === null)).toBe(true);
  expect((await makeListsPersonalData(deps).exportFor(admin.memberId)).adminActivity).toEqual([]);
  const version = (await deps.lists.get(id))?.value.settingsVersion;
  const removed = await makeAnonymiseActivity(deps)();
  expect(removed).toEqual(ok(3));
  expect((await deps.lists.get(id))?.value.activity?.every((event) => event.admin === null)).toBe(
    true,
  );
  expect((await deps.entries.forList(id))[0]?.activity?.[0]?.admin).toBeNull();
  expect((await deps.lists.get(id))?.value.settingsVersion).toBe(version);
  expect(await makeAnonymiseActivity(deps)()).toEqual(ok(0));
});

test('personal export includes only the caller’s attributed events; erasure removes identity and preserves decisions', async () => {
  await moderate();
  const data = makeListsPersonalData(deps);
  expect((await data.exportFor(admin.memberId)).adminActivity).toHaveLength(3);
  expect((await data.exportFor(member.memberId)).adminActivity).toEqual([]);
  expect((await data.eraseFor(admin.memberId)).ok).toBe(true);
  expect((await data.exportFor(admin.memberId)).adminActivity).toEqual([]);
  const result = await history();
  expect(result.ok && result.value).toHaveLength(3);
  expect(result.ok && result.value.every((event) => event.adminName === null)).toBe(true);
});

test('failed anonymisation returns a conflict so identity erasure can stop and retry', async () => {
  const spy = vi.spyOn(deps.lists, 'save').mockResolvedValue(false);
  expect(await makeListsPersonalData(deps).eraseFor(admin.memberId)).toMatchObject({
    ok: false,
    error: { kind: 'conflict' },
  });

  spy.mockRestore();
  expect((await makeListsPersonalData(deps).eraseFor(admin.memberId)).ok).toBe(true);
});

test('retention retries a settings race without overwriting the winning edit', async () => {
  deps.clock.set(at('2027-01-01'));
  const save = deps.lists.save.bind(deps.lists);
  const spy = vi.spyOn(deps.lists, 'save');
  spy
    .mockImplementationOnce(async (_, version) => {
      const current = await deps.lists.get(id);
      if (current === null) throw new Error('fixture');
      expect(
        await save(
          { ...current.value, config: { ...current.value.config, description: 'Concurrent edit' } },
          version,
        ),
      ).toBe(true);
      return false;
    })
    .mockImplementation(save);
  try {
    expect(await makeAnonymiseActivity(deps)()).toEqual(ok(1));
    const current = await deps.lists.get(id);
    expect(current?.value.config.description).toBe('Concurrent edit');
    expect(current?.value.activity?.[0]?.admin).toBeNull();
  } finally {
    spy.mockRestore();
  }
});

test('backups omit both kinds of history and import starts a fresh attributed event', async () => {
  await moderate();
  const backup = await makeExportForBackup(deps)(id);
  if (!backup.ok || backup.value[0] === undefined) throw new Error('fixture');
  expect(JSON.stringify(backup.value)).not.toContain('"activity"');
  expect(JSON.stringify(backup.value)).not.toContain('Alex');
  const restored = await makeRestoreFromBackup(deps)(backup.value[0].backup, {
    keepMember: () => Promise.resolve(true),
    importedBy: admin,
  });
  if (!restored.ok) throw new Error('fixture');
  expect(await makeGetListActivity(deps)(admin, { list: restored.value.listId })).toMatchObject({
    ok: true,
    value: [{ action: 'imported', adminName: 'Alex' }],
  });
});

test('entry deletion removes all identifying history and retains only a generic action; list deletion removes all history', async () => {
  const entry = await moderate();
  const input = {
    listId: id,
    entryId: entry.id,
    token: nominationToken(entry),
    confirmation: entry.item.title,
  };
  expect((await makePrepareEntryDeletion(deps)(admin, input)).ok).toBe(true);
  expect(
    (await makeWithEntryDeletion(deps)(admin, input, () => Promise.resolve(ok(undefined)))).ok,
  ).toBe(true);
  expect((await makeFinishEntryDeletion(deps)(admin, input)).ok).toBe(true);
  expect((await makeFinishEntryDeletion(deps)(admin, input)).ok).toBe(true);
  const result = await history();
  expect(
    result.ok && result.value.filter((event) => event.action === 'entry-deleted'),
  ).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain('An item');
  expect(await deps.entries.get(id, entry.id)).toBeNull();
  expect(
    (await makePrepareListDeletion(deps)(admin, { listId: id, confirmation: 'decisions' })).ok,
  ).toBe(true);
  expect((await makeFinishListDeletion(deps)(admin, { listId: id })).ok).toBe(true);
  expect(await history()).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  expect((await makeListsPersonalData(deps).exportFor(admin.memberId)).adminActivity).toEqual([]);
});
