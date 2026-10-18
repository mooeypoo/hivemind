import { afterEach, beforeEach, expect, test } from 'vitest';
import type { InsightsDto, EntryDto, ListDto, ListDetailDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import type { Endpoint } from '../../functions.ts';
import {
  createList,
  nominate,
  scheduleList,
  withdrawNomination,
  closeVoting,
  deleteEntry,
  deleteList,
  getList,
} from './lists.ts';
import { changeScore } from './voting.ts';
import { deleteMyData } from './me.ts';
import { getInsights } from './insights.ts';

let h: Harness;
let admin: string;
let member: string;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- expected response shape
const call = async <T>(
  endpoint: Endpoint,
  method: string,
  path: string,
  cookie: string | null,
  body?: unknown,
) => {
  const response = await endpoint(
    request(method, path, {
      ...(cookie === null ? {} : { cookies: { [SESSION_COOKIE]: cookie } }),
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: (text === '' ? null : JSON.parse(text)) as T,
  };
};
beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'Admin' });
  member = await signInAs(h, { id: '900000000000000010', username: 'Private member' });
});
afterEach(async () => {
  await h.close();
});
const insights = (query = '') =>
  call<InsightsDto>(getInsights, 'GET', `/api/admin/insights${query}`, admin);
const seed = async (slug: string, resultsVisibility = 'live') => {
  const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
    title: slug,
    slug,
    itemSource: { kind: 'freeform' },
    resultsVisibility,
  });
  expect(created.status).toBe(201);
  await call(scheduleList, 'POST', `/api/lists/${slug}/schedule`, admin, {
    opensAt: '2026-01-01T00:00:00Z',
    nominationsCloseAt: null,
    closesAt: null,
  });
  const nominated = await call<EntryDto>(nominate, 'POST', `/api/lists/${slug}/entries`, member, {
    title: 'An entry',
  });
  expect(nominated.status).toBe(201);
  await call(changeScore, 'PUT', `/api/lists/${slug}/ballot`, member, {
    entryId: nominated.body.id,
    score: 7,
  });
  return { list: created.body, entry: nominated.body };
};
test('admin-only, validated query, no-store, and an empty site is a real zero state', async () => {
  expect((await call(getInsights, 'GET', '/api/admin/insights', null)).status).toBe(401);
  expect((await call(getInsights, 'GET', '/api/admin/insights', member)).status).toBe(403);
  expect((await insights('?extra=1')).status).toBe(422);
  expect((await insights('?list=')).status).toBe(422);
  expect((await insights('?list=missing')).status).toBe(404);
  const result = await insights();
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.body).toMatchObject({
    includedLists: 0,
    excludedLists: 0,
    lists: [],
    totals: { voters: 0, entries: 0 },
  });
});
test('totals deduplicate members across lists without exposing identities or scores', async () => {
  await seed('one');
  await seed('two');
  const result = await insights();
  expect(result.body.totals).toEqual({
    entries: 2,
    withdrawnEntries: 0,
    setAsideEntries: 0,
    ratings: 2,
    voters: 1,
    nominators: 1,
    ratedEntries: 2,
    readyEntries: 0,
  });
  expect(JSON.stringify(result.body)).not.toMatch(
    /Private member|900000000000000010|memberId|voterName|activeEntryIds|scores/,
  );
  expect((await insights('?list=one')).body.totals.ratings).toBe(1);
});
test('after-close participation never enters site totals and is revealed on closing', async () => {
  await seed('live');
  await seed('secret', 'after-close');
  const result = await insights();
  expect(result.body).toMatchObject({
    includedLists: 1,
    excludedLists: 1,
    totals: { ratings: 1, entries: 1 },
  });
  const hidden = (await insights('?list=secret')).body;
  expect(hidden.lists).toEqual([
    {
      id: result.body.lists.find((list) => list.slug === 'secret')?.id,
      title: 'secret',
      slug: 'secret',
      lifecycle: 'open',
      visibility: 'public',
      source: 'freeform',
      entryMode: 'nominations',
      status: 'after-close',
      revealsAt: null,
    },
  ]);
  await call(closeVoting, 'POST', '/api/lists/secret/close', admin, {});
  expect((await insights()).body).toMatchObject({
    includedLists: 2,
    excludedLists: 0,
    totals: { ratings: 2 },
  });
});
test('withdrawal and score clearing remove current participation, re-nomination restores retained ratings, erasure removes them', async () => {
  const { entry } = await seed('one');
  await call(withdrawNomination, 'POST', '/api/lists/one/entries/withdraw', member, {
    entryId: entry.id,
    token: entry.withdrawalToken,
  });
  expect((await insights()).body.totals).toMatchObject({
    ratings: 0,
    voters: 0,
    nominators: 0,
    entries: 0,
    withdrawnEntries: 1,
  });
  await call(nominate, 'POST', '/api/lists/one/entries', member, { title: 'An entry' });
  expect((await insights()).body.totals).toMatchObject({ ratings: 1, voters: 1, nominators: 1 });
  await call(changeScore, 'PUT', '/api/lists/one/ballot', member, {
    entryId: entry.id,
    score: null,
  });
  expect((await insights()).body.totals).toMatchObject({ ratings: 0, voters: 0, nominators: 1 });
  await call(changeScore, 'PUT', '/api/lists/one/ballot', member, { entryId: entry.id, score: 7 });
  expect((await call(deleteMyData, 'DELETE', '/api/me', member)).status).toBe(204);
  expect((await insights()).body.totals).toMatchObject({
    ratings: 0,
    voters: 0,
    nominators: 0,
    entries: 1,
  });
});
test('permanent entry and list deletion leave no retained statistics', async () => {
  const { list, entry } = await seed('one');
  const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/one', admin);
  const removed = await call(deleteEntry, 'POST', `/api/lists/${list.id}/entries/delete`, admin, {
    entryId: entry.id,
    token: detail.body.entries[0]?.deletionToken,
    confirmation: entry.item.title,
  });
  expect(removed.status).toBe(204);
  expect((await insights()).body.totals).toMatchObject({
    ratings: 0,
    voters: 0,
    nominators: 0,
    entries: 0,
  });
  expect(
    (await call(deleteList, 'DELETE', `/api/lists/${list.id}`, admin, { confirmation: 'one' }))
      .status,
  ).toBe(204);
  expect((await insights()).body.lists).toEqual([]);
});
