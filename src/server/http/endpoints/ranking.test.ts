import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type { EntryDto, LeaderboardDto, ListDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { createList, nominate, scheduleList } from './lists.ts';
import { getLeaderboard } from './ranking.ts';
import { changeScore } from './voting.ts';

type Endpoint = (request: Request, app: App) => Promise<Response>;

let h: Harness;
let admin: string;
let ada: string;
let bob: string;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- names the expected response type
const call = async <T>(
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
) => {
  const response = await endpoint(
    request(method, path, {
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T, text };
};

/** An open free-text list with Root and Wingspan nominated. */
const setUp = async (visibility: 'live' | 'after-close') => {
  const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
    title: 'Games',
    slug: 'games',
    itemSource: { kind: 'freeform' },
    resultsVisibility: visibility,
    ranking: { strategy: 'bayesian', minVotes: 2 },
  });
  await call(scheduleList, 'POST', `/api/lists/${created.body.id}/schedule`, admin, {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: null,
    closesAt: '2026-01-10T00:00:00.000Z',
  });
  const root = (
    await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, { title: 'Root' })
  ).body.id;
  const wingspan = (
    await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', bob, { title: 'Wingspan' })
  ).body.id;
  const rate = (session: string, entryId: string, score: number) =>
    call(changeScore, 'PUT', '/api/lists/games/ballot', session, { entryId, score });
  await rate(ada, root, 9);
  await rate(bob, root, 7);
  await rate(ada, wingspan, 6);
  return { root, wingspan };
};

beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
  ada = await signInAs(h, { id: '900000000000000010', username: 'ada' });
  bob = await signInAs(h, { id: '900000000000000011', username: 'bob' });
});
afterEach(async () => {
  await h.close();
});

describe('GET /api/lists/:list/leaderboard', () => {
  test('ranks entries live; ones below the minimum votes are provisional, after them and unranked', async () => {
    await setUp('live');
    const result = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      ada,
    );
    expect(result.status).toBe(200);
    if (result.body.hidden) throw new Error('expected a visible board');
    // C = (9+7+6)/3 = 22/3. Root: v=2, R=8 → 0.5·8 + 0.5·22/3 ≈ 7.67. Wingspan: v=1, R=6 → 6/3 + (2/3)·22/3 ≈ 6.89.
    expect(
      result.body.rows.map((row) => [
        row.rank,
        row.item.title,
        row.score,
        row.votes,
        row.provisional,
        row.votesNeeded,
      ]),
    ).toEqual([
      [1, 'Root', 7.67, 2, false, 0],
      [null, 'Wingspan', 6.89, 1, true, 1],
    ]);
    expect(result.body.minVotes).toBe(2);
  });

  test('an after-close list reveals nothing before it closes, not even to Admins', async () => {
    await setUp('after-close');
    for (const session of [ada, admin]) {
      const result = await call<LeaderboardDto>(
        getLeaderboard,
        'GET',
        '/api/lists/games/leaderboard',
        session,
      );
      expect(result.body).toEqual({ hidden: true, revealsAt: '2026-01-10T00:00:00.000Z' });
      expect(result.text).not.toMatch(/score|votes|rank|Root|Wingspan/);
    }
  });

  test('and shows the results once closed', async () => {
    await setUp('after-close');
    h.clock.set(new Date('2026-01-10T00:00:00Z'));
    const fresh = await signInAs(h, { id: '900000000000000010', username: 'ada' });
    const result = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      fresh,
    );
    expect(result.body.hidden).toBe(false);
  });

  test('needs a signed-in member', async () => {
    await setUp('live');
    expect((await call(getLeaderboard, 'GET', '/api/lists/games/leaderboard', null)).status).toBe(
      401,
    );
  });
});
