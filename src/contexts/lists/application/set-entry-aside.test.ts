import { beforeEach, expect, test, vi } from 'vitest';
import { anonymous, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { LIST_DEFAULTS, type ListId } from '../domain/list.ts';
import { nominationToken, type Entry, type EntryId } from '../domain/entry.ts';
import {
  InMemoryEntryRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeSetEntryAside } from './set-entry-aside.ts';

const admin: Actor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  isAdmin: true,
  roleIds: [],
};
const listId = 'list-id' as ListId;
let deps: Parameters<typeof makeSetEntryAside>[0];
let entry: Entry;
beforeEach(async () => {
  deps = {
    lists: new InMemoryListRepository(),
    slugs: new InMemorySlugIndex(),
    entries: new InMemoryEntryRepository(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
    ids: new SequentialIds(),
  };
  await deps.lists.save(
    {
      id: listId,
      config: { ...LIST_DEFAULTS, title: 'List', slug: 'list', itemSource: { kind: 'freeform' } },
      phase: 'published',
      visibility: 'public',
      createdAt: deps.clock.now(),
      archivedAt: null,
      schedule: {
        opensAt: new Date('2025-01-01T00:00:00Z'),
        nominationsCloseAt: null,
        closesAt: null,
      },
    },
    null,
  );
  entry = {
    id: 'freeform.pick' as EntryId,
    listId,
    item: { source: 'freeform', externalId: 'pick', title: 'Pick', subtitle: null, imageUrl: null },
    nominatedBy: null,
    nominatedAt: deps.clock.now(),
    snapshotPurgedAt: null,
  };
  await deps.entries.create(entry);
});
const input = (reason: string | null = 'Outside the criteria') => ({
  list: listId,
  entryId: entry.id,
  token: nominationToken(entry),
  expectedReason: null,
  reason,
});

test('requires an Admin, an existing active entry and the current nomination token', async () => {
  const run = makeSetEntryAside(deps);
  expect((await run(anonymous, input())).ok).toBe(false);
  expect((await run({ ...admin, isAdmin: false }, input())).ok).toBe(false);
  expect((await run(admin, { ...input(), entryId: 'missing' })).ok).toBe(false);
  expect((await run(admin, { ...input(), token: 'stale' })).ok).toBe(false);
  const saved = await deps.entries.get(listId, entry.id);
  if (saved === null) throw new Error('fixture');
  await deps.entries.save({ ...entry, withdrawnAt: deps.clock.now() }, saved.version);
  expect((await run(admin, input())).ok).toBe(false);
});

test('trims a required explanation of at most 500 characters; null restores the entry', async () => {
  const run = makeSetEntryAside(deps);
  for (const reason of ['', ' \n ', 'x'.repeat(501)]) {
    expect((await run(admin, input(reason))).ok).toBe(false);
  }
  expect((await run(admin, input(` ${'x'.repeat(500)} `))).ok).toBe(true);
  expect((await deps.entries.get(listId, entry.id))?.value.setAsideReason).toBe('x'.repeat(500));
  expect(
    (await run(admin, { ...input('Different reason'), expectedReason: 'x'.repeat(500) })).ok,
  ).toBe(true);
  expect((await run(admin, { ...input(null), expectedReason: 'Different reason' })).ok).toBe(true);
  expect((await deps.entries.get(listId, entry.id))?.value).toEqual({
    ...entry,
    setAsideReason: null,
  });
});

test('rejects stale explanation edits rather than overwriting another Admin', async () => {
  const run = makeSetEntryAside(deps);
  expect((await run(admin, input())).ok).toBe(true);
  expect((await run(admin, input('Overwrite'))).ok).toBe(false);
});

test('permits closed-list corrections but not changes to archived lists', async () => {
  const saved = await deps.lists.get(listId);
  if (saved === null) throw new Error('fixture');
  const closed = {
    ...saved.value,
    schedule: {
      opensAt: new Date('2025-01-01T00:00:00Z'),
      nominationsCloseAt: null,
      closesAt: new Date('2025-02-01T00:00:00Z'),
    },
  };
  await deps.lists.save(closed, saved.version);
  expect((await makeSetEntryAside(deps)(admin, input())).ok).toBe(true);
  const latest = await deps.lists.get(listId);
  if (latest === null) throw new Error('fixture');
  await deps.lists.save(
    { ...closed, phase: 'archived', archivedAt: deps.clock.now() },
    latest.version,
  );
  expect(
    (
      await makeSetEntryAside(deps)(admin, {
        ...input(null),
        expectedReason: 'Outside the criteria',
      })
    ).ok,
  ).toBe(false);
});

test('retries a lost entry write once and then returns conflict', async () => {
  const save = vi.spyOn(deps.entries, 'save').mockResolvedValue(false);
  const result = await makeSetEntryAside(deps)(admin, input());
  expect(!result.ok && result.error.kind).toBe('conflict');
  expect(save).toHaveBeenCalledTimes(2);
});
