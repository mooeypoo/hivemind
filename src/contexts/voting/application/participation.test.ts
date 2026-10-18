import { expect, test, vi } from 'vitest';
import { anonymous, type MemberActor, type MemberId } from '../../../shared/kernel/index.ts';
import type { BallotEntryId, BallotListId } from '../domain/ballot.ts';
import type { BallotRepository } from './ports.ts';
import { makeParticipationSummary } from './participation-summary.ts';

const admin: MemberActor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  roleIds: [],
  isAdmin: true,
};
const ballot = (memberId: string, scores: Record<string, number>) => ({
  listId: 'one' as BallotListId,
  memberId: memberId as MemberId,
  scores: scores as Record<BallotEntryId, number>,
  voterName: 'Never export me',
});
const setup = () => {
  const forList = vi
    .fn<BallotRepository['forList']>()
    .mockImplementation((id) =>
      Promise.resolve(
        id === 'one'
          ? [
              ballot('same', { a: 0, b: 8, withdrawn: 9 }),
              ballot('empty', {}),
              ballot('old', { withdrawn: 3 }),
            ]
          : [ballot('same', { a: 7 }), ballot('other', { a: 4 })],
      ),
    );
  return { ballots: { forList } };
};
const scope = [
  { id: 'one', activeEntryIds: ['a', 'b', 'c'], minVotes: 2 },
  { id: 'two', activeEntryIds: ['a'], minVotes: 0 },
];

test('voters have current scores, zero is a rating, people deduplicate across lists, and no values or identities escape', async () => {
  const result = await makeParticipationSummary(setup())(admin, scope);
  expect(result).toEqual({
    ok: true,
    value: {
      voters: 2,
      lists: [
        {
          id: 'one',
          ratings: 2,
          voters: 1,
          ratedEntries: 2,
          readyEntries: 0,
          distribution: [
            { ratings: 0, entries: 1 },
            { ratings: 1, entries: 2 },
          ],
        },
        {
          id: 'two',
          ratings: 2,
          voters: 2,
          ratedEntries: 1,
          readyEntries: 1,
          distribution: [{ ratings: 2, entries: 1 }],
        },
      ],
    },
  });
  expect(JSON.stringify(result)).not.toMatch(/memberId|voterName|Never export me|withdrawn/);
});

test('authorization precedes all ballot reads, and an empty scope reads nothing', async () => {
  const deps = setup();
  const get = makeParticipationSummary(deps);
  expect(await get(anonymous, scope)).toMatchObject({
    ok: false,
    error: { kind: 'unauthenticated' },
  });
  expect(await get({ ...admin, isAdmin: false }, scope)).toMatchObject({
    ok: false,
    error: { kind: 'forbidden' },
  });
  expect(deps.ballots.forList).not.toHaveBeenCalled();
  expect(await get(admin, [])).toEqual({ ok: true, value: { voters: 0, lists: [] } });
});

test('zero minimum still needs a rating, and source failures reject rather than becoming zeroes', async () => {
  const deps = setup();
  deps.ballots.forList.mockResolvedValueOnce([]);
  expect(
    await makeParticipationSummary(deps)(admin, [
      { id: 'one', activeEntryIds: ['a'], minVotes: 0 },
    ]),
  ).toMatchObject({
    ok: true,
    value: { voters: 0, lists: [{ readyEntries: 0, ratedEntries: 0 }] },
  });
  deps.ballots.forList.mockRejectedValueOnce(new Error('Store unavailable'));
  await expect(makeParticipationSummary(deps)(admin, scope)).rejects.toThrow('Store unavailable');
});
