import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { LEADERBOARD_TTL_SECONDS } from '../domain/leaderboard.ts';
import { FakeRankingSources, InMemoryLeaderboardCache } from '../infrastructure/testing/fakes.ts';
import { makeDropStaleLeaderboards } from './drop-stale-leaderboards.ts';
import { makeGetLeaderboard, type LeaderboardView } from './get-leaderboard.ts';

const member = (isAdmin = false): Actor => ({
  kind: 'member',
  memberId: 'm1' as MemberId,
  displayName: 'Ada',
  roleIds: [],
  isAdmin,
});

let sources: FakeRankingSources;
let cache: InMemoryLeaderboardCache;
let clock: FixedClock;
beforeEach(() => {
  sources = new FakeRankingSources();
  cache = new InMemoryLeaderboardCache();
  clock = new FixedClock(new Date('2026-03-12T00:00:00Z'));
});

const leaderboard = async (actor: Actor = member(), list = 'l1'): Promise<LeaderboardView> => {
  const result = await makeGetLeaderboard({ lists: sources, scores: sources, cache, clock })(
    actor,
    { list },
  );
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};
const titles = (view: LeaderboardView) =>
  view.hidden ? [] : view.board.rows.map((row) => row.item.title);

describe('visibility', () => {
  test('live results are visible while the list is open', async () => {
    sources.ballots = [{ a: 3, b: 8 }];
    expect(titles(await leaderboard())).toEqual(['Beta', 'Alpha']);
  });

  test.each([false, true])(
    'after-close results stay hidden before closing, with no numbers (admin: %s)',
    async (isAdmin) => {
      sources.settings = { ...sources.settings, resultsVisibility: 'after-close' };
      sources.ballots = [{ a: 3 }];
      const view = await leaderboard(member(isAdmin));
      expect(view).toEqual({ hidden: true, revealsAt: new Date('2026-03-20T00:00:00Z') });
      expect(sources.builds).toBe(0);
    },
  );

  test('after-close results appear once the list closes', async () => {
    sources.settings = { ...sources.settings, resultsVisibility: 'after-close' };
    sources.ballots = [{ a: 3 }];
    clock.set(new Date('2026-03-20T00:00:00Z'));
    expect((await leaderboard()).hidden).toBe(false);
  });

  test('needs a signed-in member and a visible list', async () => {
    const run = makeGetLeaderboard({ lists: sources, scores: sources, cache, clock });
    expect((await run(anonymous, { list: 'l1' })).ok).toBe(false);
    const missing = await run(member(), { list: 'draft-or-missing' });
    expect(!missing.ok && missing.error.code).toBe('lists.not-found');
  });
});

describe('cache', () => {
  test('within the TTL, new scores alone do not rebuild it', async () => {
    sources.ballots = [{ a: 9 }];
    await leaderboard();
    sources.ballots.push({ b: 10 });
    clock.advanceSeconds(LEADERBOARD_TTL_SECONDS - 1);
    expect(titles(await leaderboard())).toEqual(['Alpha', 'Beta']);
    expect(sources.builds).toBe(1);
  });

  test('after the TTL it is rebuilt with the new scores', async () => {
    sources.ballots = [{ a: 9 }];
    await leaderboard();
    sources.ballots.push({ b: 10 });
    clock.advanceSeconds(LEADERBOARD_TTL_SECONDS);
    expect(titles(await leaderboard())).toEqual(['Beta', 'Alpha']);
    expect(sources.builds).toBe(2);
  });

  test('a new nomination rebuilds it straight away', async () => {
    await leaderboard();
    sources.addEntry('c', 'Gamma');
    expect(titles(await leaderboard())).toContain('Gamma');
    expect(sources.builds).toBe(2);
  });

  test('rows carry the item snapshot and aggregates only', async () => {
    sources.ballots = [{ a: 4 }];
    const view = await leaderboard();
    expect(view.hidden ? null : view.board.rows[0]).toEqual({
      entryId: 'a',
      rank: 1,
      score: 4,
      mean: 4,
      votes: 1,
      provisional: false,
      votesNeeded: 0,
      item: {
        source: 'freeform',
        externalId: 'alpha',
        title: 'Alpha',
        subtitle: null,
        imageUrl: null,
      },
    });
  });
});

describe('dropping stale boards', () => {
  test('deletes boards older than a day; they are rebuilt when next viewed', async () => {
    await leaderboard();
    clock.advanceSeconds(23 * 3600);
    expect(await makeDropStaleLeaderboards({ cache, clock })()).toEqual({ dropped: 0 });
    clock.advanceSeconds(3600);
    expect(await makeDropStaleLeaderboards({ cache, clock })()).toEqual({ dropped: 1 });
    expect(await cache.get('l1')).toBeNull();
  });
});
