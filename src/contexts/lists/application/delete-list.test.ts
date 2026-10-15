import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { LIST_DEFAULTS, type ListId } from '../domain/list.ts';
import type { EntryId } from '../domain/entry.ts';
import { FakeCatalog } from '../infrastructure/testing/fake-catalog.ts';
import {
  InMemoryEntryRepository,
  InMemoryLedgerRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeCreateList } from './create-list.ts';
import { makeFinishListDeletion, makePrepareListDeletion } from './delete-list.ts';
import { withEntryWrite } from './entry-write.ts';
import { makeGetList } from './get-list.ts';
import { makeListLists } from './list-lists.ts';

const admin: Actor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  isAdmin: true,
  roleIds: [],
};
const member: Actor = { ...admin, isAdmin: false };
let id: ListId;
const config = {
  ...LIST_DEFAULTS,
  title: 'Mistake',
  slug: 'mistake',
  itemSource: { kind: 'freeform' },
};
let deps: {
  lists: InMemoryListRepository;
  entries: InMemoryEntryRepository;
  ledgers: InMemoryLedgerRepository;
  slugs: InMemorySlugIndex;
  catalog: FakeCatalog;
  clock: FixedClock;
  ids: SequentialIds;
};
beforeEach(async () => {
  deps = {
    lists: new InMemoryListRepository(),
    entries: new InMemoryEntryRepository(),
    ledgers: new InMemoryLedgerRepository(),
    slugs: new InMemorySlugIndex(),
    catalog: new FakeCatalog(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
    ids: new SequentialIds(),
  };
  const created = await makeCreateList(deps)(admin, config);
  if (!created.ok) throw new Error('fixture');
  id = created.value.id;
});

describe('permanent list deletion', () => {
  test.each([anonymous, member])('only Admins can start or finish deletion', async (actor) => {
    expect(
      (await makePrepareListDeletion(deps)(actor, { listId: id, confirmation: 'mistake' })).ok,
    ).toBe(false);
    expect((await makeFinishListDeletion(deps)(actor, { listId: id })).ok).toBe(false);
    expect(await deps.slugs.lookup('mistake')).toBe(id);
  });

  test('requires an immutable ID and exact current slug confirmation', async () => {
    for (const input of [
      { listId: id, confirmation: 'wrong' },
      { listId: 'mistake', confirmation: 'mistake' },
    ]) {
      expect((await makePrepareListDeletion(deps)(admin, input)).ok).toBe(false);
    }
    expect((await deps.lists.get(id))?.value.deletionRequested).not.toBe(true);
  });

  test('pending writes postpone cleanup and deletion remains resumable and Admin-only', async () => {
    await deps.lists.beginEntryWrite(id, 'in-flight');
    const prepare = makePrepareListDeletion(deps);
    const result = await prepare(admin, { listId: id, confirmation: 'mistake' });
    expect(!result.ok && result.error.code).toBe('lists.deletion-busy');
    expect((await deps.lists.get(id))?.value.deletionRequested).toBe(true);
    expect((await makeGetList(deps)(member, { list: id })).ok).toBe(false);
    const detail = await makeGetList(deps)(admin, { list: id });
    expect(detail.ok && detail.value.deleting).toBe(true);
    const listed = await makeListLists(deps)(member);
    expect(listed.ok && listed.value.some((list) => list.id === id)).toBe(false);
    const pending = (await deps.lists.get(id))?.value;
    if (pending === undefined) throw new Error('fixture');
    let wrote = false;
    const attempt = await withEntryWrite(deps.lists, pending, 'late', () => {
      wrote = true;
      return Promise.resolve({ ok: true, value: undefined });
    });
    expect(attempt.ok).toBe(false);
    expect(wrote).toBe(false);
    expect(await deps.slugs.lookup('mistake')).toBe(id);
    await deps.lists.endEntryWrite(id, 'in-flight');
    expect((await prepare(admin, { listId: id, confirmation: 'mistake' })).ok).toBe(true);
  });

  test('cleanup removes active/withdrawn entries and ledgers, releases the slug and is repeatable', async () => {
    for (const entryId of ['active', 'withdrawn']) {
      await deps.entries.create({
        id: entryId as EntryId,
        listId: id,
        item: {
          source: 'freeform',
          externalId: entryId,
          title: entryId,
          subtitle: null,
          imageUrl: null,
        },
        nominatedBy: null,
        nominatedAt: deps.clock.now(),
        snapshotPurgedAt: null,
        ...(entryId === 'withdrawn' ? { withdrawnAt: deps.clock.now() } : {}),
      });
    }
    await deps.ledgers.save({ memberId: 'a' as MemberId, listId: id, entryIds: [] }, null);
    expect((await makeFinishListDeletion(deps)(admin, { listId: id })).ok).toBe(false);
    expect(
      (
        await makePrepareListDeletion(deps)(admin, {
          listId: id,
          confirmation: 'mistake',
        })
      ).ok,
    ).toBe(true);
    expect((await makeFinishListDeletion(deps)(admin, { listId: id })).ok).toBe(true);
    expect(await deps.entries.forList(id)).toEqual([]);
    expect(await deps.ledgers.forList(id)).toEqual([]);
    expect(await deps.lists.get(id)).toBeNull();
    expect(await deps.slugs.lookup('mistake')).toBeNull();
    const replacement = await makeCreateList(deps)(admin, config);
    expect(replacement.ok).toBe(true);
    expect((await makeFinishListDeletion(deps)(admin, { listId: id })).ok).toBe(true);
    expect(await deps.slugs.lookup('mistake')).toBe(replacement.ok && replacement.value.id);
  });

  test('a partial local cleanup keeps the intent and slug so a retry can finish', async () => {
    await deps.ledgers.save({ memberId: 'a' as MemberId, listId: id, entryIds: [] }, null);
    await deps.ledgers.save({ memberId: 'b' as MemberId, listId: id, entryIds: [] }, null);
    const remove = deps.ledgers.delete;
    let failed = false;
    deps.ledgers.delete = async (memberId, listId) => {
      if (memberId === 'b' && !failed) {
        failed = true;
        throw new Error('Ledger cleanup interrupted');
      }
      await remove(memberId, listId);
    };
    await makePrepareListDeletion(deps)(admin, { listId: id, confirmation: 'mistake' });
    await expect(makeFinishListDeletion(deps)(admin, { listId: id })).rejects.toThrow(
      'Ledger cleanup interrupted',
    );
    expect(await deps.slugs.lookup('mistake')).toBe(id);
    expect((await deps.lists.get(id))?.value.deletionRequested).toBe(true);
    expect(await deps.ledgers.forList(id)).toHaveLength(1);
    expect((await makeFinishListDeletion(deps)(admin, { listId: id })).ok).toBe(true);
    expect(await deps.ledgers.forList(id)).toEqual([]);
  });

  test('retrying after slug release never releases the replacement list slug', async () => {
    await makePrepareListDeletion(deps)(admin, { listId: id, confirmation: 'mistake' });
    const remove = deps.lists.delete;
    deps.lists.delete = () => Promise.reject(new Error('Final deletion interrupted'));
    const finish = makeFinishListDeletion(deps);
    await expect(finish(admin, { listId: id })).rejects.toThrow('Final deletion interrupted');
    expect(await deps.slugs.lookup('mistake')).toBeNull();
    const replacement = await makeCreateList(deps)(admin, config);
    expect(replacement.ok).toBe(true);
    deps.lists.delete = remove;
    expect((await finish(admin, { listId: id })).ok).toBe(true);
    expect(await deps.slugs.lookup('mistake')).toBe(replacement.ok && replacement.value.id);
    expect(await deps.lists.get(id)).toBeNull();
  });
});
