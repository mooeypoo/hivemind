import { afterEach, beforeEach, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type { EntryDto, ListDetailDto, ListDto, LeaderboardDto, BallotDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import {
  createList,
  scheduleList,
  nominate,
  getList,
  setEntryAside,
  closeVoting,
  archiveList,
  editList,
} from './lists.ts';
import { changeScore, getMyBallot } from './voting.ts';
import { getLeaderboard } from './ranking.ts';

let h: Harness;
let admin: string;
let member: string;
let list: ListDto;
let entry: EntryDto;
const call = (
  endpoint: (request: Request, app: App) => Promise<Response>,
  method: string,
  suffix: string,
  session: string | null = admin,
  body?: unknown,
) =>
  endpoint(
    request(method, `/api/lists/${list.id}${suffix}`, {
      origin: SITE_URL,
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
const body = (
  reason: string | null = 'Outside the criteria',
  expectedReason: string | null = null,
) => ({
  entryId: entry.id,
  token: entry.deletionToken,
  reason,
  expectedReason,
});
beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID });
  member = await signInAs(h, { id: '900000000000000010' });
  list = (await (
    await createList(
      request('POST', '/api/lists', {
        origin: SITE_URL,
        cookies: { [SESSION_COOKIE]: admin },
        body: {
          title: 'Picks',
          slug: 'picks',
          itemSource: { kind: 'freeform' },
          ranking: { strategy: 'bayesian', minVotes: 1 },
        },
      }),
      h.app,
    )
  ).json()) as ListDto;
  expect(
    (
      await call(scheduleList, 'POST', '/schedule', admin, {
        opensAt: '2026-01-01T00:00:00.000Z',
        nominationsCloseAt: null,
        closesAt: null,
      })
    ).status,
  ).toBe(200);
  expect((await call(nominate, 'POST', '/entries', member, { title: 'Pick' })).status).toBe(201);
  expect((await call(nominate, 'POST', '/entries', member, { title: 'Keep' })).status).toBe(201);
  const detail = (await (await call(getList, 'GET', '')).json()) as ListDetailDto;
  const found = detail.entries.find((entry) => entry.item.title === 'Pick');
  if (found === undefined) throw new Error('fixture');
  entry = found;
  expect(
    (await call(changeScore, 'PUT', '/ballot', member, { entryId: entry.id, score: 9 })).status,
  ).toBe(200);
});
afterEach(async () => {
  await h.close();
});

test('only Admins classify entries, with strict input and same-origin mutation checks', async () => {
  expect((await call(setEntryAside, 'PUT', '/entries/set-aside', null, body())).status).toBe(401);
  expect((await call(setEntryAside, 'PUT', '/entries/set-aside', member, body())).status).toBe(403);
  for (const invalid of [
    { ...body(), reason: ' ' },
    { ...body(), reason: 'x'.repeat(501) },
    { ...body(), extra: true },
  ]) {
    expect((await call(setEntryAside, 'PUT', '/entries/set-aside', admin, invalid)).status).toBe(
      422,
    );
  }
  expect(
    (
      await setEntryAside(
        request('PUT', `/api/lists/${list.id}/entries/set-aside`, {
          origin: 'https://foreign.example',
          cookies: { [SESSION_COOKIE]: admin },
          body: body(),
        }),
        h.app,
      )
    ).status,
  ).toBe(403);
});

test('classification immediately rebuilds rankings, stays member-visible and preserves voting', async () => {
  const combined = (await (
    await call(getLeaderboard, 'GET', '/leaderboard', member)
  ).json()) as LeaderboardDto;
  expect((await call(setEntryAside, 'PUT', '/entries/set-aside', admin, body())).status).toBe(200);
  const detail = (await (await call(getList, 'GET', '', member)).json()) as ListDetailDto;
  expect(detail.entries.find((e) => e.id === entry.id)?.setAsideReason).toBe(
    'Outside the criteria',
  );
  const board = (await (
    await call(getLeaderboard, 'GET', '/leaderboard', member)
  ).json()) as LeaderboardDto;
  if (board.hidden || combined.hidden) throw new Error('fixture');
  expect(board.rows).toEqual(combined.rows);
  expect(board.groups?.main.map((row) => row.entryId)).not.toContain(entry.id);
  expect(board.groups?.setAside).toMatchObject([{ entryId: entry.id, rank: 1, score: 9 }]);
  expect(
    (await call(changeScore, 'PUT', '/ballot', member, { entryId: entry.id, score: 8 })).status,
  ).toBe(200);
  const ballot = (await (await call(getMyBallot, 'GET', '/ballot', member)).json()) as BallotDto;
  expect(ballot.scores[entry.id]).toBe(8);
  expect(
    (await call(setEntryAside, 'PUT', '/entries/set-aside', admin, body('Overwrite'))).status,
  ).toBe(409);
  expect(
    (
      await call(
        setEntryAside,
        'PUT',
        '/entries/set-aside',
        admin,
        body(null, 'Outside the criteria'),
      )
    ).status,
  ).toBe(200);
  const restored = (await (
    await call(getLeaderboard, 'GET', '/leaderboard', member)
  ).json()) as LeaderboardDto;
  expect(restored).not.toHaveProperty('groups');
});

test('after-close visibility hides all ranking variants, even from Admins', async () => {
  // Published config is immutable; create a second draft for sealed results.
  const sealed = (await (
    await createList(
      request('POST', '/api/lists', {
        origin: SITE_URL,
        cookies: { [SESSION_COOKIE]: admin },
        body: { title: 'Sealed', slug: 'sealed', itemSource: { kind: 'freeform' } },
      }),
      h.app,
    )
  ).json()) as ListDto;
  list = sealed;
  expect(
    (await call(editList, 'PUT', '', admin, { resultsVisibility: 'after-close' })).status,
  ).toBe(200);
  await call(scheduleList, 'POST', '/schedule', admin, {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: null,
    closesAt: null,
  });
  await call(nominate, 'POST', '/entries', member, { title: 'Pick' });
  const detail = (await (await call(getList, 'GET', '')).json()) as ListDetailDto;
  const found = detail.entries[0];
  if (found === undefined) throw new Error('fixture');
  entry = found;
  await call(setEntryAside, 'PUT', '/entries/set-aside', admin, body());
  for (const viewer of [admin, member]) {
    expect(await (await call(getLeaderboard, 'GET', '/leaderboard', viewer)).json()).toEqual({
      hidden: true,
      revealsAt: null,
    });
  }
});

test('closed lists allow corrections; archived lists reject them', async () => {
  expect((await call(closeVoting, 'POST', '/close')).status).toBe(200);
  expect((await call(setEntryAside, 'PUT', '/entries/set-aside', admin, body())).status).toBe(200);
  expect((await call(archiveList, 'POST', '/archive')).status).toBe(200);
  expect(
    (
      await call(
        setEntryAside,
        'PUT',
        '/entries/set-aside',
        admin,
        body(null, 'Outside the criteria'),
      )
    ).status,
  ).toBe(409);
});
