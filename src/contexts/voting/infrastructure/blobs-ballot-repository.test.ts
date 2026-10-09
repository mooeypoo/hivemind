import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { MemberId } from '../../../shared/kernel/index.ts';
import type { Ballot, BallotListId } from '../domain/ballot.ts';
import { createBlobsBallotRepository } from './blobs-ballot-repository.ts';

let blobs: LocalBlobs;
beforeAll(async () => {
  blobs = await startLocalBlobs();
});
afterAll(async () => {
  await blobs.close();
});

const ballot = (listId: string, memberId: string, scores: Record<string, number>): Ballot => ({
  listId: listId as BallotListId,
  memberId: memberId as MemberId,
  scores,
});

describe('Blobs ballot repository', () => {
  test('creates, updates with the version, and stores a v1 record', async () => {
    const store = blobs.store('voting');
    const repo = createBlobsBallotRepository(store);
    expect(await repo.save(ballot('l1', 'm1', { e1: 5 }), null)).toBe(true);
    expect(await repo.save(ballot('l1', 'm1', { e1: 6 }), null)).toBe(false);
    const stored = await repo.get('l1' as BallotListId, 'm1' as MemberId);
    expect(stored?.ballot.scores).toEqual({ e1: 5 });
    expect(await repo.save(ballot('l1', 'm1', { e1: 6 }), stored?.version ?? null)).toBe(true);
    expect(await store.get('ballot/l1/m1', { type: 'json' })).toEqual({
      v: 1,
      listId: 'l1',
      memberId: 'm1',
      scores: { e1: 6 },
    });
  });

  test('finds ballots by list and by member, without mixing up similar ids', async () => {
    const repo = createBlobsBallotRepository(blobs.store('voting-2'));
    await repo.save(ballot('l1', 'm1', { a: 1 }), null);
    await repo.save(ballot('l1', 'm11', { a: 2 }), null);
    await repo.save(ballot('l2', 'm1', { b: 3 }), null);
    expect((await repo.forList('l1' as BallotListId)).map((b) => b.memberId).sort()).toEqual([
      'm1',
      'm11',
    ]);
    expect((await repo.forMember('m1' as MemberId)).map((b) => b.listId).sort()).toEqual([
      'l1',
      'l2',
    ]);
    await repo.delete('l1' as BallotListId, 'm1' as MemberId);
    expect((await repo.forMember('m1' as MemberId)).map((b) => b.listId)).toEqual(['l2']);
  });
});
