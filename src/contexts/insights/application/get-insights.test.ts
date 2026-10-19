import { expect, test, vi } from 'vitest';
import {
  anonymous,
  domainError,
  err,
  ok,
  type MemberActor,
  type MemberId,
} from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import type { ListParticipation, ParticipationList, VotingParticipation } from './ports.ts';
import { makeGetInsights } from './get-insights.ts';

const admin: MemberActor = {
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  roleIds: [],
  isAdmin: true,
};
const base = {
  id: 'one',
  title: 'One',
  slug: 'one',
  lifecycle: 'open',
  viewers: 'everyone',
  source: 'freeform',
  entryMode: 'nominations',
} as const;
const available: ParticipationList = {
  ...base,
  status: 'available',
  entries: 2,
  withdrawnEntries: 1,
  setAsideEntries: 1,
  nominators: 2,
  minVotes: 2,
  activeEntryIds: ['a', 'b'],
};
const setup = () => ({
  clock: new FixedClock(new Date('2026-01-01')),
  lists: {
    scope: vi.fn<ListParticipation['scope']>().mockResolvedValue(
      ok({
        nominators: 2,
        lists: [
          available,
          { ...base, id: 'secret', status: 'after-close', revealsAt: null },
          { ...base, id: 'paused', status: 'paused' },
        ],
      }),
    ),
  },
  voting: {
    summarize: vi.fn<VotingParticipation['summarize']>().mockResolvedValue(
      ok({
        voters: 1,
        lists: [
          {
            id: 'one',
            ratings: 2,
            voters: 1,
            ratedEntries: 2,
            readyEntries: 0,
            distribution: [{ ratings: 1, entries: 2 }],
          },
        ],
      }),
    ),
  },
});
test('authorizes first and never reads ballots for excluded lists or exposes entry IDs', async () => {
  const deps = setup();
  const get = makeGetInsights(deps);
  expect(await get(anonymous, {})).toMatchObject({ ok: false });
  expect(await get({ ...admin, isAdmin: false }, {})).toMatchObject({ ok: false });
  expect(deps.lists.scope).not.toHaveBeenCalled();
  const result = await get(admin, {});
  expect(deps.voting.summarize).toHaveBeenCalledExactlyOnceWith(admin, [available]);
  expect(result).toMatchObject({
    ok: true,
    value: {
      includedLists: 1,
      excludedLists: 2,
      totals: { entries: 2, ratings: 2, voters: 1, nominators: 2 },
      lists: [{ status: 'available' }, { status: 'after-close' }, { status: 'paused' }],
    },
  });
  expect(JSON.stringify(result)).not.toMatch(/activeEntryIds|memberId|displayName/);
});
test('propagates source errors and never substitutes zero for missing summaries', async () => {
  const deps = setup();
  const failure = err(domainError('unavailable', 'test.unavailable', 'Unavailable'));
  deps.lists.scope.mockResolvedValueOnce(failure);
  expect(await makeGetInsights(deps)(admin, {})).toEqual(failure);
  expect(deps.voting.summarize).not.toHaveBeenCalled();
  deps.voting.summarize.mockResolvedValueOnce(failure);
  expect(await makeGetInsights(deps)(admin, {})).toEqual(failure);
  deps.voting.summarize.mockResolvedValueOnce(ok({ voters: 0, lists: [] }));
  expect(await makeGetInsights(deps)(admin, {})).toMatchObject({
    ok: false,
    error: { code: 'insights.incomplete' },
  });
});
