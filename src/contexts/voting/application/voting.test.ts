import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId, type RoleId } from '../../../shared/kernel/index.ts';
import type { BallotListId } from '../domain/ballot.ts';
import {
  FakeListReader,
  InMemoryBallotRepository,
} from '../infrastructure/testing/in-memory-voting.ts';
import { makeChangeScore } from './change-score.ts';
import { makeGetMyBallot } from './get-my-ballot.ts';
import { makeVotingPersonalData } from './personal-data.ts';
import { makeScoresForList } from './scores-for-list.ts';

const member = (id: string, roles: string[] = []): Actor => ({
  kind: 'member',
  memberId: id as MemberId,
  displayName: id,
  roleIds: roles as RoleId[],
  isAdmin: false,
});
const ada = member('ada');
const bob = member('bob');

let lists: FakeListReader;
let ballots: InMemoryBallotRepository;
beforeEach(() => {
  lists = new FakeListReader();
  ballots = new InMemoryBallotRepository();
  lists.add('l1');
});

const score = (who: Actor, entryId: string, value: number | null, list = 'l1') =>
  makeChangeScore({ lists, ballots })(who, { list, entryId, score: value });
const myBallot = (who: Actor, list = 'l1') => makeGetMyBallot({ lists, ballots })(who, { list });

describe('scoring', () => {
  test('sets, replaces and clears scores on the member ballot', async () => {
    await score(ada, 'e1', 7);
    await score(ada, 'e2', 3);
    await score(ada, 'e1', 9);
    const cleared = await score(ada, 'e2', null);
    expect(cleared).toEqual({ ok: true, value: { listId: 'l1', scores: { e1: 9 } } });
  });

  test('a score must be within the list scale', async () => {
    lists.add('l2', { scale: { min: 0, max: 5 } });
    expect((await score(ada, 'e1', 0, 'l2')).ok).toBe(true);
    const tooHigh = await score(ada, 'e1', 6, 'l2');
    expect(!tooHigh.ok && tooHigh.error.code).toBe('voting.score-out-of-range');
  });

  test('a score must refer to an existing entry of that list', async () => {
    const result = await score(ada, 'not-an-entry', 5);
    expect(!result.ok && result.error.code).toBe('voting.unknown-entry');
  });

  test.each([
    ['set', 5],
    ['clear', null],
  ] as const)('scores can be %s only while the list is open', async (_, value) => {
    lists.add('closed', { isOpen: false });
    const result = await score(ada, 'e1', value, 'closed');
    expect(!result.ok && result.error.code).toBe('voting.closed');
  });

  test('needs a signed-in member', async () => {
    const result = await score(anonymous, 'e1', 5);
    expect(!result.ok && result.error.kind).toBe('unauthenticated');
  });

  test('needs any one of the required roles, when the list has some', async () => {
    lists.add('club', { requiredRoleIds: ['r1' as RoleId, 'r2' as RoleId] });
    const denied = await score(ada, 'e1', 5, 'club');
    expect(!denied.ok && denied.error.code).toBe('voting.role-required');
    expect((await score(member('cy', ['r2']), 'e1', 5, 'club')).ok).toBe(true);
  });

  test('a hidden list does not exist for members', async () => {
    lists.hidden.add('l1');
    const result = await score(ada, 'e1', 5);
    expect(!result.ok && result.error.code).toBe('lists.not-found');
    const read = await myBallot(ada);
    expect(!read.ok && read.error.code).toBe('lists.not-found');
  });

  test('a list that does not exist (or is a draft) is not found', async () => {
    const result = await score(ada, 'e1', 5, 'nope');
    expect(!result.ok && result.error.code).toBe('lists.not-found');
  });

  test('two score changes at the same moment both land, with a retry', async () => {
    await Promise.all([score(ada, 'e1', 4), score(ada, 'e2', 8)]);
    const result = await myBallot(ada);
    expect(result.ok && result.value.scores).toEqual({ e1: 4, e2: 8 });
  });
});

describe('privacy', () => {
  test('each member gets only their own ballot', async () => {
    await score(ada, 'e1', 10);
    await score(bob, 'e1', 2);
    expect(await myBallot(ada)).toEqual({ ok: true, value: { listId: 'l1', scores: { e1: 10 } } });
    expect(await myBallot(bob)).toEqual({ ok: true, value: { listId: 'l1', scores: { e1: 2 } } });
  });

  test('a member who has not voted gets an empty ballot, even on a closed list', async () => {
    lists.add('closed', { isOpen: false });
    expect(await myBallot(ada, 'closed')).toEqual({
      ok: true,
      value: { listId: 'closed', scores: {} },
    });
  });
});

describe('personal data', () => {
  test('exports every ballot of the member, and erasure deletes them', async () => {
    lists.add('l2');
    await score(ada, 'e1', 7);
    await score(ada, 'e2', 3, 'l2');
    await score(bob, 'e1', 1);
    const data = makeVotingPersonalData({ ballots });

    expect(await data.exportFor('ada' as MemberId)).toEqual({
      ballots: [
        { listId: 'l1', scores: { e1: 7 } },
        { listId: 'l2', scores: { e2: 3 } },
      ],
    });
    expect((await data.eraseFor('ada' as MemberId)).ok).toBe(true);
    expect(await ballots.forMember('ada' as MemberId)).toEqual([]);
    expect(await ballots.forList('l1' as BallotListId)).toHaveLength(1);
  });
});

describe('scores for ranking', () => {
  test('are every ballot of the list, without who cast them', async () => {
    await score(ada, 'e1', 7);
    await score(bob, 'e1', 3);
    const scores = await makeScoresForList({ ballots })('l1');
    expect(scores).toEqual([{ e1: 7 }, { e1: 3 }]);
    expect(JSON.stringify(scores)).not.toMatch(/ada|bob/);
  });
});
