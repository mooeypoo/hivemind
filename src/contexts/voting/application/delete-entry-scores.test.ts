import { beforeEach, describe, expect, test, vi } from 'vitest';
import { anonymous, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import type { Ballot, BallotListId } from '../domain/ballot.ts';
import { InMemoryBallotRepository } from '../infrastructure/testing/in-memory-voting.ts';
import { makeDeleteEntryScores } from './delete-entry-scores.ts';

const admin: Actor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  roleIds: [],
  isAdmin: true,
};
const id = 'list' as BallotListId;
const ballot: Ballot = {
  listId: id,
  memberId: 'voter' as MemberId,
  voterName: 'Voter',
  scores: { deleted: 9, kept: 4 },
};
let ballots: InMemoryBallotRepository;
beforeEach(async () => {
  ballots = new InMemoryBallotRepository();
  await ballots.save(ballot, null);
});
describe('permanent entry score cleanup', () => {
  test.each([anonymous, { ...admin, isAdmin: false }])('requires Admin', async (actor) => {
    expect(
      (await makeDeleteEntryScores({ ballots })(actor, { listId: id, entryId: 'deleted' })).ok,
    ).toBe(false);
    expect((await ballots.get(id, ballot.memberId))?.ballot.scores).toEqual(ballot.scores);
  });
  test('clears only the target entry across all ballots and is repeatable', async () => {
    await ballots.save({ ...ballot, memberId: 'other' as MemberId, scores: { deleted: 3 } }, null);
    await ballots.save({ ...ballot, listId: 'unrelated' as BallotListId }, null);
    const cleanup = makeDeleteEntryScores({ ballots });
    expect((await cleanup(admin, { listId: id, entryId: 'deleted' })).ok).toBe(true);
    expect((await cleanup(admin, { listId: id, entryId: 'deleted' })).ok).toBe(true);
    expect((await ballots.forList(id)).map((value) => value.scores)).toEqual([{ kept: 4 }, {}]);
    expect(
      (await ballots.get('unrelated' as BallotListId, ballot.memberId))?.ballot.scores,
    ).toEqual(ballot.scores);
  });
  test('concurrent personal erasure is never undone by a cleanup retry', async () => {
    const save = ballots.save.bind(ballots);
    vi.spyOn(ballots, 'save').mockImplementationOnce(async (value, version) => {
      await ballots.delete(id, ballot.memberId);
      return save(value, version);
    });
    expect(
      (await makeDeleteEntryScores({ ballots })(admin, { listId: id, entryId: 'deleted' })).ok,
    ).toBe(true);
    expect(await ballots.get(id, ballot.memberId)).toBeNull();
  });
});
