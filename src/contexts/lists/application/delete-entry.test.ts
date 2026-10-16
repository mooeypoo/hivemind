import { beforeEach, describe, expect, test } from 'vitest';
import { ok, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { LIST_DEFAULTS, type ListId } from '../domain/list.ts';
import { nominationToken, type Entry, type EntryId } from '../domain/entry.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryLedgerRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeCreateList } from './create-list.ts';
import {
  makePrepareEntryDeletion,
  makeWithEntryDeletion,
  makeFinishEntryDeletion,
} from './delete-entry.ts';
import { withEntryWrite } from './entry-write.ts';

const admin: Actor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  isAdmin: true,
  roleIds: [],
};
const member: Actor = { ...admin, isAdmin: false };
const deps = {
  lists: new InMemoryListRepository(),
  slugs: new InMemorySlugIndex(),
  entries: new InMemoryEntryRepository(),
  ledgers: new InMemoryLedgerRepository(),
  catalog: new FakeCatalog(),
  clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
  ids: new SequentialIds(),
};
let listId: ListId;
let entry: Entry;
const input = () => ({
  listId,
  entryId: entry.id,
  token: nominationToken(entry),
  confirmation: entry.item.title,
});
beforeEach(async () => {
  deps.lists = new InMemoryListRepository();
  deps.slugs = new InMemorySlugIndex();
  deps.entries = new InMemoryEntryRepository();
  deps.ledgers = new InMemoryLedgerRepository();
  const created = await makeCreateList(deps)(admin, {
    ...LIST_DEFAULTS,
    title: 'List',
    slug: 'list',
    itemSource: { kind: 'freeform' },
  });
  if (!created.ok) throw new Error('fixture');
  listId = created.value.id;
  entry = {
    id: 'freeform.pick' as EntryId,
    listId,
    item: { source: 'freeform', externalId: 'pick', title: 'Pick', subtitle: null, imageUrl: null },
    nominatedBy: { memberId: admin.memberId, displayName: admin.displayName },
    nominatedAt: deps.clock.now(),
    nominationId: deps.ids.next(),
    snapshotPurgedAt: null,
  };
  await deps.entries.create(entry);
  await deps.ledgers.save(
    { memberId: admin.memberId, listId, entryIds: [entry.id], claims: { [entry.id]: 'claim' } },
    null,
  );
});

describe('permanent entry deletion', () => {
  test('requires Admin, immutable list ID, exact title and entry incarnation', async () => {
    const prepare = makePrepareEntryDeletion(deps);
    expect((await prepare(member, input())).ok).toBe(false);
    expect((await prepare(admin, { ...input(), listId: 'list' })).ok).toBe(false);
    expect((await prepare(admin, { ...input(), confirmation: 'wrong' })).ok).toBe(false);
    expect((await prepare(admin, { ...input(), token: 'stale' })).ok).toBe(false);
    expect((await deps.lists.get(listId))?.value.entryDeletion).toBeUndefined();
  });

  test('persists intent before draining writers and fences delayed admissions', async () => {
    const found = await deps.lists.get(listId);
    if (found === null) throw new Error('fixture');
    const original = found.value;
    await deps.lists.beginEntryWrite(listId, 'active');
    const prepare = makePrepareEntryDeletion(deps);
    expect((await prepare(admin, input())).ok).toBe(false);
    expect((await deps.lists.get(listId))?.value.entryDeletion?.entryId).toBe(entry.id);
    let ran = false;
    const attempt = await withEntryWrite(deps.lists, original, 'late', () => {
      ran = true;
      return Promise.resolve(ok(undefined));
    });
    expect(attempt.ok).toBe(false);
    expect(ran).toBe(false);
    await deps.lists.endEntryWrite(listId, 'active');
    expect((await prepare(admin, input())).ok).toBe(true);
  });

  test('removes all ledger references, then permits fresh nomination but not stale cleanup', async () => {
    const found = await deps.lists.get(listId);
    if (found === null) throw new Error('fixture');
    const original = found.value;
    const prepare = makePrepareEntryDeletion(deps);
    const cleanup = makeWithEntryDeletion(deps);
    const finish = makeFinishEntryDeletion(deps);
    expect((await prepare(admin, input())).ok).toBe(true);
    expect((await cleanup(admin, input(), () => Promise.resolve(ok(undefined)))).ok).toBe(true);
    expect((await finish(admin, input())).ok).toBe(true);
    expect(await deps.entries.get(listId, entry.id)).toBeNull();
    expect((await deps.ledgers.get(admin.memberId, listId))?.value.entryIds).toEqual([]);
    expect((await deps.ledgers.get(admin.memberId, listId))?.value.claims).toEqual({});
    expect(await deps.entries.create({ ...entry, nominationId: 'new-incarnation' })).toBe(true);
    expect((await prepare(admin, input())).ok).toBe(false);
    let cleaned = false;
    expect(
      (
        await cleanup(admin, input(), () => {
          cleaned = true;
          return Promise.resolve(ok(undefined));
        })
      ).ok,
    ).toBe(false);
    expect(cleaned).toBe(false);
    expect((await deps.entries.get(listId, entry.id))?.value.nominationId).toBe('new-incarnation');
    const delayed = await withEntryWrite(deps.lists, original, 'old-writer', () =>
      Promise.resolve(ok(undefined)),
    );
    expect(delayed.ok).toBe(false);
  });

  test('an admitted re-nomination wins over a stale deletion target without leaving a pause', async () => {
    await deps.lists.beginEntryWrite(listId, 'earlier-nomination');
    const prepare = makePrepareEntryDeletion(deps);
    expect((await prepare(admin, input())).ok).toBe(false);
    const current = await deps.entries.get(listId, entry.id);
    if (current === null) throw new Error('fixture');
    await deps.entries.save({ ...entry, nominationId: 'replacement' }, current.version);
    await deps.lists.endEntryWrite(listId, 'earlier-nomination');
    expect((await prepare(admin, input())).ok).toBe(false);
    expect((await deps.lists.get(listId))?.value.entryDeletion).toBeNull();
    expect((await deps.entries.get(listId, entry.id))?.value.nominationId).toBe('replacement');
  });

  test('uncertain cleanup writes retain their fence until an operator checks them', async () => {
    await makePrepareEntryDeletion(deps)(admin, input());
    await expect(
      makeWithEntryDeletion(deps)(admin, input(), () =>
        Promise.reject(new Error('Uncertain remote write')),
      ),
    ).rejects.toThrow('Uncertain remote write');
    expect(await deps.lists.hasEntryWrites(listId)).toBe(true);
    expect((await makePrepareEntryDeletion(deps)(admin, input())).ok).toBe(false);
    expect((await deps.lists.get(listId))?.value.entryDeletion).not.toBeNull();
  });

  test('finishing blocks new cleaners and waits for admitted cleanup before reopening', async () => {
    await makePrepareEntryDeletion(deps)(admin, input());
    let started!: () => void;
    let resume!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const cleaning = makeWithEntryDeletion(deps)(admin, input(), async () => {
      started();
      await wait;
      return ok(undefined);
    });
    await ready;
    const finish = makeFinishEntryDeletion(deps);
    expect((await finish(admin, input())).ok).toBe(false);
    expect(
      (await makeWithEntryDeletion(deps)(admin, input(), () => Promise.resolve(ok(undefined)))).ok,
    ).toBe(false);
    resume();
    expect((await cleaning).ok).toBe(true);
    expect((await finish(admin, input())).ok).toBe(true);
  });
});
