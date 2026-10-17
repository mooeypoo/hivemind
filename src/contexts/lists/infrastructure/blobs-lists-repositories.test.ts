import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { MemberId } from '../../../shared/kernel/index.ts';
import { entryIdFor, type Entry } from '../domain/entry.ts';
import { DEFAULT_SCALE, newList, publish, type ListId } from '../domain/list.ts';
import {
  createBlobsEntryRepository,
  createBlobsLedgerRepository,
  createBlobsListRepository,
  createBlobsSlugIndex,
} from './blobs-lists-repositories.ts';

let blobs: LocalBlobs;
beforeAll(async () => {
  blobs = await startLocalBlobs();
});
afterAll(async () => {
  await blobs.close();
});

const listId = 'l1' as ListId;
const draft = newList(
  listId,
  {
    title: 'Best',
    slug: 'best',
    description: '',
    itemSource: { kind: 'preset', presetId: 'p1' },
    entryMode: 'nominations',
    scale: DEFAULT_SCALE,
    maxNominationsPerMember: 3,
    resultsVisibility: 'after-close',
    ranking: { strategy: 'bayesian', minVotes: 2 },
    showNominators: false,
    requiredRoleIds: [],
    scoreVisibility: 'private',
  },
  new Date('2026-03-01T00:00:00Z'),
);

describe('Blobs lists repositories', () => {
  test('draft schedules round-trip with nullable opening and older records have no plan', async () => {
    const store = blobs.store('draft-schedules');
    const repo = createBlobsListRepository(store);
    const plan = {
      opensAt: null,
      nominationsCloseAt: new Date('2026-04-10T00:00:00Z'),
      closesAt: new Date('2026-04-20T00:00:00Z'),
    };
    expect(await repo.save({ ...draft, draftSchedule: plan }, null)).toBe(true);
    expect((await repo.get(listId))?.value.draftSchedule).toEqual(plan);
    const record: unknown = await store.get(`list/${listId}`, { type: 'json' });
    expect(record).toMatchObject({
      draftSchedule: {
        opensAt: null,
        nominationsCloseAt: '2026-04-10T00:00:00.000Z',
        closesAt: '2026-04-20T00:00:00.000Z',
      },
    });
    if (typeof record !== 'object' || record === null) throw new Error('fixture');
    const { draftSchedule: omitted, ...legacy } = record as Record<string, unknown>;
    expect(omitted).toBeDefined();
    await store.setJSON(`list/${listId}`, legacy);
    expect((await repo.get(listId))?.value.draftSchedule).toBeNull();
  });

  test('permanent deletion keeps only an ID fence and prevents stale aggregate resurrection', async () => {
    const store = blobs.store('deleted-list-fence');
    const repo = createBlobsListRepository(store);
    await repo.save(draft, null);
    const before = await repo.get(listId);
    if (before === null) throw new Error('fixture');
    await repo.save({ ...draft, deletionRequested: true }, before.version);
    expect((await repo.get(listId))?.value.deletionRequested).toBe(true);
    await repo.delete(listId);
    expect(await repo.get(listId)).toBeNull();
    expect(await repo.all()).toEqual([]);
    expect(await store.get(`list/${listId}`, { type: 'json' })).toEqual({ v: 3, deleted: true });
    expect(await repo.save(draft, null)).toBe(false);
    expect(await repo.save(draft, before.version)).toBe(false);
  });

  test('a delayed old-owner slug release cannot erase a replacement claim', async () => {
    const store = blobs.store('slug-deletion-race');
    const slugs = createBlobsSlugIndex(store);
    const replacement = 'replacement' as ListId;
    expect(await slugs.claim('reusable', listId)).toBe(true);
    const write = store.setJSON.bind(store);
    let interleave = true;
    const spy = vi.spyOn(store, 'setJSON').mockImplementation(async (...args) => {
      const [key, value] = args;
      if (
        key === 'slug/reusable' &&
        typeof value === 'object' &&
        value !== null &&
        'listId' in value &&
        value.listId === null &&
        interleave
      ) {
        interleave = false;
        await slugs.release('reusable', listId);
        expect(await slugs.claim('reusable', replacement)).toBe(true);
      }
      return write(...args);
    });
    try {
      await slugs.release('reusable', listId);
      expect(await slugs.lookup('reusable')).toBe(replacement);
      await slugs.release('reusable', listId);
      expect(await slugs.lookup('reusable')).toBe(replacement);
      await slugs.release('reusable', replacement);
      expect(await slugs.lookup('reusable')).toBeNull();
      expect(await slugs.claim('reusable', listId)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  test('entry admissions change the ETag and independent markers clean up separately', async () => {
    const store = blobs.store('source-admission');
    const repo = createBlobsListRepository(store);
    await repo.save(draft, null);
    const before = await repo.get(listId);
    if (before === null) throw new Error('fixture');
    await repo.beginEntryWrite(listId, 'a');
    await repo.beginEntryWrite(listId, 'b');
    expect(await store.get('entry-write/l1/a', { type: 'json' })).toEqual({ v: 1 });
    expect(await repo.hasEntryWrites(listId)).toBe(true);
    expect(await repo.save({ ...draft, entryWriteToken: 'a' }, before.version)).toBe(true);
    expect(
      await repo.save(
        { ...draft, config: { ...draft.config, itemSource: { kind: 'freeform' } } },
        before.version,
      ),
    ).toBe(false);
    expect((await repo.get(listId))?.value.entryWriteToken).toBe('a');
    await repo.endEntryWrite(listId, 'a');
    expect(await repo.hasEntryWrites(listId)).toBe(true);
    await repo.endEntryWrite(listId, 'b');
    expect(await repo.hasEntryWrites(listId)).toBe(false);
  });

  test('lists round-trip with their schedule and use optimistic concurrency', async () => {
    const repo = createBlobsListRepository(blobs.store('lists'));
    expect(await repo.save(draft, null)).toBe(true);
    expect(await repo.save(draft, null)).toBe(false);

    const stored = await repo.get(listId);
    expect(stored?.value).toEqual(draft);
    const published = publish(
      draft,
      {
        opensAt: new Date('2026-03-10T00:00:00Z'),
        nominationsCloseAt: null,
        closesAt: new Date('2026-03-20T00:00:00Z'),
      },
      new Date('2026-03-01T00:00:00Z'),
    );
    if (!published.ok) throw new Error('fixture');
    expect(await repo.save(published.value, stored?.version ?? null)).toBe(true);
    expect(await repo.save(published.value, stored?.version ?? null)).toBe(false);
    expect((await repo.get(listId))?.value).toEqual(published.value);
    expect(await repo.all()).toEqual([published.value]);
  });

  test('reads lists stored in the earlier v1 shape', async () => {
    const store = blobs.store('lists-legacy');
    const record = (requiredRoleId: string | null) => ({
      v: 1,
      id: 'old',
      config: {
        ...draft.config,
        requiredRoleIds: undefined,
        requiredRoleId,
      },
      schedule: null,
      phase: 'draft',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    await store.setJSON('list/old', record('123456'));
    const repo = createBlobsListRepository(store);
    expect((await repo.get('old' as ListId))?.value.config.requiredRoleIds).toEqual(['123456']);
    await store.setJSON('list/old', record(null));
    expect((await repo.get('old' as ListId))?.value.config.requiredRoleIds).toEqual([]);
  });

  test('reads v2 lists stored before visibility existed, and open-ended schedules', async () => {
    const store = blobs.store('lists-v2');
    await store.setJSON('list/old', {
      v: 2,
      id: 'old',
      config: draft.config,
      schedule: { opensAt: '2026-03-10T00:00:00.000Z', nominationsCloseAt: null, closesAt: null },
      phase: 'published',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    const read = (await createBlobsListRepository(store).get('old' as ListId))?.value;
    expect(read?.visibility).toBe('public');
    expect(read?.schedule?.closesAt).toBeNull();
    expect(read?.archivedAt).toBeNull();
  });

  test('a slug can be claimed by one list at a time', async () => {
    const slugs = createBlobsSlugIndex(blobs.store('lists'));
    expect(await slugs.claim('taken', listId)).toBe(true);
    expect(await slugs.claim('taken', 'l2' as ListId)).toBe(false);
    expect(await slugs.lookup('taken')).toBe(listId);
    await slugs.release('taken', listId);
    expect(await slugs.lookup('taken')).toBeNull();
  });

  test('entries are created once per item, read back per list, and stored as v1 records', async () => {
    const store = blobs.store('lists');
    const entries = createBlobsEntryRepository(store);
    const item = {
      source: 'freeform',
      externalId: 'a/b c',
      title: 'A/B C',
      subtitle: null,
      imageUrl: null,
    };
    const entry: Entry = {
      id: entryIdFor(item),
      listId,
      item,
      nominatedBy: { memberId: 'm1' as MemberId, displayName: 'Ada' },
      nominatedAt: new Date('2026-03-12T00:00:00Z'),
      snapshotPurgedAt: null,
    };
    expect(await entries.create(entry)).toBe(true);
    expect(await entries.create(entry)).toBe(false);
    expect(await entries.forList(listId)).toEqual([{ ...entry, setAsideReason: null }]);
    expect(await entries.idsForList(listId)).toEqual([entry.id]);

    const stored = await entries.get(listId, entry.id);
    expect(await entries.save({ ...entry, nominatedBy: null }, stored?.version ?? '')).toBe(true);
    expect(await store.get(`entry/l1/${entry.id}`, { type: 'json' })).toEqual({
      v: 1,
      id: 'freeform.a%2Fb%20c',
      listId: 'l1',
      item,
      nominatedBy: null,
      nominatedAt: '2026-03-12T00:00:00.000Z',
      snapshotPurgedAt: null,
      setAsideReason: null,
    });
    const latest = await entries.get(listId, entry.id);
    expect(
      await entries.save(
        { ...entry, setAsideReason: 'Outside the criteria' },
        latest?.version ?? '',
      ),
    ).toBe(true);
    expect((await entries.get(listId, entry.id))?.value.setAsideReason).toBe(
      'Outside the criteria',
    );
    await store.setJSON(`entry/l1/${entry.id}`, {
      v: 1,
      ...entry,
      nominatedAt: entry.nominatedAt.toISOString(),
    });
    expect((await entries.get(listId, entry.id))?.value.setAsideReason).toBeNull();
  });

  test('ledgers are found by member across lists, and deleted', async () => {
    const ledgers = createBlobsLedgerRepository(blobs.store('lists'));
    const memberId = 'm9' as MemberId;
    await ledgers.save({ memberId, listId, entryIds: [] }, null);
    await ledgers.save({ memberId, listId: 'l2' as ListId, entryIds: [] }, null);
    expect((await ledgers.forMember(memberId)).map((ledger) => ledger.listId).sort()).toEqual([
      'l1',
      'l2',
    ]);
    await ledgers.delete(memberId, listId);
    expect(await ledgers.forMember(memberId)).toHaveLength(1);
  });
});
