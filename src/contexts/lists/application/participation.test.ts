import { expect, test, vi } from 'vitest';
import { anonymous, type MemberActor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { LIST_DEFAULTS, type List, type ListId } from '../domain/list.ts';
import type { Entry, EntryId } from '../domain/entry.ts';
import {
  InMemoryEntryRepository,
  InMemoryListRepository,
  InMemorySlugIndex,
} from '../infrastructure/testing/in-memory-lists.ts';
import { makeParticipationScope } from './participation.ts';

const admin: MemberActor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  roleIds: [],
  isAdmin: true,
};
const now = new Date('2026-01-05T00:00:00Z');
const list = (id: string, overrides: Partial<List> = {}): List => ({
  id: id as ListId,
  config: { ...LIST_DEFAULTS, title: id, slug: id, itemSource: { kind: 'freeform' } },
  phase: 'published',
  schedule: { opensAt: new Date('2026-01-01'), nominationsCloseAt: null, closesAt: null },
  createdAt: now,
  archivedAt: null,
  ...overrides,
});
const entry = (listId: ListId, id: string, memberId: string | null): Entry => ({
  id: id as EntryId,
  listId,
  item: { source: 'freeform', externalId: id, title: id, subtitle: null, imageUrl: null },
  nominatedBy:
    memberId === null ? null : { memberId: memberId as MemberId, displayName: 'Never export me' },
  nominatedAt: now,
  snapshotPurgedAt: null,
});
const setup = async (...values: List[]) => {
  const deps = {
    lists: new InMemoryListRepository(),
    entries: new InMemoryEntryRepository(),
    slugs: new InMemorySlugIndex(),
    clock: new FixedClock(now),
  };
  for (const value of values) {
    await deps.lists.save(value, null);
    await deps.slugs.claim(value.config.slug, value.id);
  }
  return deps;
};

test('authorizes before reading any participation data', async () => {
  const deps = await setup(list('one'));
  const read = vi.spyOn(deps.lists, 'all');
  const get = makeParticipationScope(deps);
  expect(await get(anonymous, {})).toMatchObject({ ok: false, error: { kind: 'unauthenticated' } });
  expect(await get({ ...admin, isAdmin: false }, {})).toMatchObject({
    ok: false,
    error: { kind: 'forbidden' },
  });
  expect(read).not.toHaveBeenCalled();
});

test('counts active attributed nominators, deduplicates across lists, and never exports identities', async () => {
  const one = list('one');
  const two = list('two', { phase: 'draft', schedule: null });
  const deps = await setup(one, two);
  await deps.entries.create(entry(one.id, 'a', 'same'));
  await deps.entries.create({ ...entry(one.id, 'b', 'same'), setAsideReason: 'Outside criteria' });
  await deps.entries.create({ ...entry(one.id, 'c', null), withdrawnAt: now });
  await deps.entries.create(entry(one.id, 'd', null));
  await deps.entries.create(entry(two.id, 'e', 'same'));
  await deps.entries.create(entry(two.id, 'f', 'other'));
  const result = await makeParticipationScope(deps)(admin, {});
  if (!result.ok) throw new Error('fixture');
  expect(result.value.nominators).toBe(2);
  expect(result.value.lists[0]).toMatchObject({
    status: 'available',
    entries: 3,
    withdrawnEntries: 1,
    setAsideEntries: 1,
    nominators: 1,
    activeEntryIds: ['a', 'b', 'd'],
  });
  expect(JSON.stringify(result)).not.toMatch(/Never export me|memberId|displayName/);
});

test('embargoed and paused lists expose metadata only and never contribute nominators', async () => {
  const secret = list('secret');
  const embargoed = {
    ...secret,
    config: { ...secret.config, resultsVisibility: 'after-close' as const },
  };
  const paused = list('paused', { deletionRequested: true });
  const deps = await setup(embargoed, paused);
  const reads = vi.spyOn(deps.entries, 'forList');
  const get = makeParticipationScope(deps);
  const result = await get(admin, {});
  if (!result.ok) throw new Error('fixture');
  expect(result.value.nominators).toBe(0);
  expect(result.value.lists.map((row) => row.status)).toEqual(['paused', 'after-close']);
  expect(result.value.lists.every((row) => !('activeEntryIds' in row))).toBe(true);
  expect(reads).not.toHaveBeenCalled();
  deps.clock.set(new Date('2026-02-01'));
  const closed = {
    ...embargoed,
    schedule: {
      opensAt: new Date('2026-01-01'),
      nominationsCloseAt: null,
      closesAt: new Date('2026-01-31'),
    },
  };
  const current = await deps.lists.get(secret.id);
  await deps.lists.save(closed, current?.version ?? null);
  expect(await get(admin, { list: secret.id })).toMatchObject({
    ok: true,
    value: { lists: [{ status: 'available', entries: 0 }] },
  });
});

test('filter accepts slug, avoids unrelated entries, and rejects missing lists', async () => {
  const one = list('one');
  const two = list('two');
  const deps = await setup({ ...one, config: { ...one.config, slug: 'first' } }, two);
  const read = vi.spyOn(deps.entries, 'forList');
  const get = makeParticipationScope(deps);
  expect(await get(admin, { list: 'first' })).toMatchObject({
    ok: true,
    value: { lists: [{ id: one.id }] },
  });
  expect(read).toHaveBeenCalledExactlyOnceWith(one.id);
  expect(await get(admin, { list: 'missing' })).toMatchObject({
    ok: false,
    error: { kind: 'not-found' },
  });
});

test('seeded entries do not create nominators and an unfinished entry deletion withholds all metrics', async () => {
  const base = list('seeded');
  const seeded = { ...base, config: { ...base.config, entryMode: 'seeded' as const } };
  const paused = list('paused', {
    entryDeletion: { entryId: 'a', token: 'token', title: 'Entry', phase: 'cleaning' },
  });
  const deps = await setup(seeded, paused);
  await deps.entries.create(entry(seeded.id, 'a', 'must-not-count'));
  await deps.entries.create(entry(paused.id, 'b', 'must-not-count'));
  const result = await makeParticipationScope(deps)(admin, {});
  expect(result).toMatchObject({
    ok: true,
    value: {
      nominators: 0,
      lists: [{ status: 'paused' }, { status: 'available', entries: 1, nominators: 0 }],
    },
  });
});

test('cross-list entry reads are bounded', async () => {
  const deps = await setup(
    ...Array.from({ length: 12 }, (_, index) => list(`list-${String(index)}`)),
  );
  const original = deps.entries.forList.bind(deps.entries);
  let active = 0;
  let peak = 0;
  vi.spyOn(deps.entries, 'forList').mockImplementation(async (id) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
    const result = await original(id);
    active -= 1;
    return result;
  });
  expect((await makeParticipationScope(deps)(admin, {})).ok).toBe(true);
  expect(peak).toBe(4);
});
