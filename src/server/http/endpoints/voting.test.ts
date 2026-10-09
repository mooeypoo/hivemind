import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type { BallotDto, EntryDto, ErrorDto, ListDto, MyDataExportDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { createList, getList, nominate, scheduleList } from './lists.ts';
import { deleteMyData, exportMyData } from './me.ts';
import { changeScore, getMyBallot } from './voting.ts';

type Endpoint = (request: Request, app: App) => Promise<Response>;

let h: Harness;
let admin: string;
let ada: string;
let bob: string;
let entryId: string;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- names the expected response type
const call = async <T>(
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
  origin: string | null = SITE_URL,
): Promise<{ status: number; body: T }> => {
  const response = await endpoint(
    request(method, path, {
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      ...(origin === null ? {} : { origin }),
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T };
};

const rate = (session: string, score: number | null, id = entryId) =>
  call<BallotDto>(changeScore, 'PUT', '/api/lists/games/ballot', session, { entryId: id, score });

beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
  ada = await signInAs(h, { id: '900000000000000010', username: 'ada' });
  bob = await signInAs(h, { id: '900000000000000011', username: 'bob' });

  const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
    title: 'Board games',
    slug: 'games',
    itemSource: { kind: 'freeform' },
    scale: { min: 1, max: 5 },
  });
  await call(scheduleList, 'POST', `/api/lists/${created.body.id}/schedule`, admin, {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: null,
    closesAt: '2026-01-20T00:00:00.000Z',
  });
  entryId = (
    await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, { title: 'Root' })
  ).body.id;
});
afterEach(async () => {
  await h.close();
});

describe('rating', () => {
  test('a member sets, changes and clears a score, and reads it back', async () => {
    expect((await rate(ada, 4)).body.scores).toEqual({ [entryId]: 4 });
    expect((await rate(ada, 5)).body.scores).toEqual({ [entryId]: 5 });
    expect(
      (await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games/ballot', ada)).body.scores,
    ).toEqual({
      [entryId]: 5,
    });
    expect((await rate(ada, null)).body.scores).toEqual({});
  });

  test('scores outside the scale and unknown entries are refused', async () => {
    const high = await call<ErrorDto>(changeScore, 'PUT', '/api/lists/games/ballot', ada, {
      entryId,
      score: 6,
    });
    expect(high.status).toBe(422);
    expect(high.body.error.message).toBe('A score must be a whole number from 1 to 5.');
    const unknown = await rate(ada, 3, 'freeform.nope');
    expect(unknown.status).toBe(404);
  });

  test('voting stops when the list closes', async () => {
    h.clock.set(new Date('2026-01-20T00:00:00Z'));
    ada = await signInAs(h, { id: '900000000000000010', username: 'ada' }); // sessions last 12 hours
    const result = await call<ErrorDto>(changeScore, 'PUT', '/api/lists/games/ballot', ada, {
      entryId,
      score: 3,
    });
    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe('voting.closed');
  });

  test('changing a score needs the site Origin and a signed-in member', async () => {
    expect(
      (await call(changeScore, 'PUT', '/api/lists/games/ballot', ada, { entryId, score: 3 }, null))
        .status,
    ).toBe(403);
    expect(
      (await call(changeScore, 'PUT', '/api/lists/games/ballot', null, { entryId, score: 3 }))
        .status,
    ).toBe(401);
    expect(
      (await call(changeScore, 'PUT', '/api/lists/games/ballot', ada, { entryId, score: '3' }))
        .status,
    ).toBe(422);
  });
});

describe('ballots are private', () => {
  test('no route shows one member the scores of another', async () => {
    await rate(ada, 5);
    expect(
      (await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games/ballot', bob)).body.scores,
    ).toEqual({});
    const detail = await call(getList, 'GET', '/api/lists/games', bob);
    expect(JSON.stringify(detail.body)).not.toContain('"scores"');
    expect(JSON.stringify(detail.body)).not.toMatch(/"score"\s*:/);
  });
});

describe('my data covers voting', () => {
  test('export includes my ballots, and deleting my data removes them', async () => {
    await rate(ada, 4);
    const exported = await call<MyDataExportDto>(exportMyData, 'GET', '/api/me/export', ada);
    const voting = exported.body.voting as { ballots: { scores: unknown }[] };
    expect(voting.ballots.map((ballot) => ballot.scores)).toEqual([{ [entryId]: 4 }]);

    await call(deleteMyData, 'DELETE', '/api/me', ada);
    const adaAgain = await signInAs(h, { id: '900000000000000010', username: 'ada' });
    expect(
      (await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games/ballot', adaAgain)).body.scores,
    ).toEqual({});
  });
});
