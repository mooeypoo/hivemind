import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { Leaderboard } from '../domain/leaderboard.ts';
import { createBlobsLeaderboardCache } from './blobs-leaderboard-cache.ts';

let blobs: LocalBlobs;
beforeAll(async () => {
  blobs = await startLocalBlobs();
});
afterAll(async () => {
  await blobs.close();
});

const board: Leaderboard = {
  listId: 'l1',
  computedAt: new Date('2026-03-12T00:00:00Z'),
  entryIds: ['a'],
  rows: [
    {
      entryId: 'a',
      rank: 1,
      score: 4,
      mean: 4,
      votes: 1,
      provisional: false,
      votesNeeded: 0,
      item: { source: 'freeform', externalId: 'a', title: 'A', subtitle: null, imageUrl: null },
    },
  ],
};

describe('Blobs leaderboard cache', () => {
  test('stores and reads back a board; a missing or unreadable one is a miss', async () => {
    const store = blobs.store('ranking');
    const cache = createBlobsLeaderboardCache(store);
    expect(await cache.get('l1')).toBeNull();
    await cache.put(board);
    expect(await cache.get('l1')).toEqual(board);
    await store.setJSON('leaderboard/l2', { v: 99 });
    expect(await cache.get('l2')).toBeNull();
  });

  test('holds no member ids', async () => {
    const store = blobs.store('ranking');
    await createBlobsLeaderboardCache(store).put(board);
    expect(JSON.stringify(await store.get('leaderboard/l1', { type: 'json' }))).not.toMatch(
      /member/i,
    );
  });
});
