import { afterAll, beforeAll, describe, expect, test } from 'vitest';
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
    requiredRoleId: null,
  },
  new Date('2026-03-01T00:00:00Z'),
);

describe('Blobs lists repositories', () => {
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

  test('a slug can be claimed by one list at a time', async () => {
    const slugs = createBlobsSlugIndex(blobs.store('lists'));
    expect(await slugs.claim('taken', listId)).toBe(true);
    expect(await slugs.claim('taken', 'l2' as ListId)).toBe(false);
    expect(await slugs.lookup('taken')).toBe(listId);
    await slugs.release('taken');
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
    };
    expect(await entries.create(entry)).toBe(true);
    expect(await entries.create(entry)).toBe(false);
    expect(await entries.forList(listId)).toEqual([entry]);

    const stored = await entries.get(listId, entry.id);
    expect(await entries.save({ ...entry, nominatedBy: null }, stored?.version ?? '')).toBe(true);
    expect(await store.get(`entry/l1/${entry.id}`, { type: 'json' })).toEqual({
      v: 1,
      id: 'freeform.a%2Fb%20c',
      listId: 'l1',
      item,
      nominatedBy: null,
      nominatedAt: '2026-03-12T00:00:00.000Z',
    });
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
