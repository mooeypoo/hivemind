import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type {
  EntryDto,
  ErrorDto,
  ListDetailDto,
  ListDto,
  ListsDto,
  MyDataExportDto,
  PresetImportedDto,
  SearchResultsDto,
  SourcesDto,
  BallotDto,
  LeaderboardDto,
  PublicScoresDto,
} from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { availableSources, importPreset } from './catalog.ts';
import {
  archiveList,
  closeVoting,
  createList,
  editList,
  getList,
  listLists,
  nominate,
  withdrawNomination,
  scheduleList,
  searchForList,
  setScoreVisibility,
  setVisibility,
} from './lists.ts';
import { deleteMyData, exportMyData } from './me.ts';
import { changeScore, getMyBallot, getPublicScores } from './voting.ts';
import { getLeaderboard } from './ranking.ts';

type Endpoint = (request: Request, app: App) => Promise<Response>;

let h: Harness;
let admin: string;
let ada: string;
let bob: string;

beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
  ada = await signInAs(h, { id: '900000000000000010', username: 'ada' });
  bob = await signInAs(h, { id: '900000000000000011', username: 'bob' });
});
afterEach(async () => {
  await h.close();
});

/** Calls an endpoint as a signed-in member, from the site's origin. `T` is the expected body. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- names the expected response type at each call site
const call = async <T>(
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
): Promise<{ status: number; body: T }> => {
  const response = await endpoint(
    request(method, path, {
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
  const text = await response.text();
  return { status: response.status, body: (text === '' ? null : JSON.parse(text)) as T };
};

const OPENS = '2026-01-01T00:00:00.000Z';
const NOMINATIONS_CLOSE = '2026-01-10T00:00:00.000Z';
const CLOSES = '2026-01-20T00:00:00.000Z';

/** Creates and schedules a list that is open now (the harness clock is 2026-01-01). */
const openList = async (body: Record<string, unknown>): Promise<ListDto> => {
  const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, body);
  expect(created.status).toBe(201);
  const scheduled = await call<ListDto>(
    scheduleList,
    'POST',
    `/api/lists/${created.body.id}/schedule`,
    admin,
    { opensAt: OPENS, nominationsCloseAt: NOMINATIONS_CLOSE, closesAt: CLOSES },
  );
  expect(scheduled.status).toBe(200);
  return scheduled.body;
};

describe('GET /api/catalog/sources', () => {
  test('tells Admins which item sources this site offers', async () => {
    const result = await call<SourcesDto>(availableSources, 'GET', '/api/catalog/sources', admin);
    expect(result.body).toEqual({ sources: ['tmdb-movie', 'freeform', 'preset'] });
  });

  test('is for Admins only', async () => {
    expect((await call(availableSources, 'GET', '/api/catalog/sources', ada)).status).toBe(403);
  });
});

describe('a TMDB movie list, end to end', () => {
  test('an Admin creates a draft with the defaults, hidden from members', async () => {
    const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Best Sci-Fi Movies',
      slug: 'best-sci-fi',
      itemSource: { kind: 'tmdb-movie' },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      lifecycle: 'draft',
      scale: { min: 1, max: 10 },
      entryMode: 'nominations',
      resultsVisibility: 'live',
      schedule: null,
    });
    expect((await call<ListsDto>(listLists, 'GET', '/api/lists', ada)).body).toEqual({ lists: [] });
    expect((await call(getList, 'GET', '/api/lists/best-sci-fi', ada)).status).toBe(404);
  });

  test('members search TMDB within the list and nominate; each movie once', async () => {
    const list = await openList({
      title: 'Best Sci-Fi Movies',
      slug: 'best-sci-fi',
      itemSource: { kind: 'tmdb-movie' },
    });
    expect(list.lifecycle).toBe('open');

    const search = await call<SearchResultsDto>(
      searchForList,
      'GET',
      '/api/lists/best-sci-fi/search?q=blade',
      ada,
    );
    expect(search.body.items.map((item) => [item.externalId, item.title, item.subtitle])).toEqual([
      ['78', 'Blade Runner', '1982'],
      ['335984', 'Blade Runner 2049', '2017'],
    ]);

    const nominated = await call<EntryDto>(
      nominate,
      'POST',
      '/api/lists/best-sci-fi/entries',
      ada,
      {
        externalId: '78',
      },
    );
    expect(nominated.status).toBe(201);
    expect(nominated.body).toMatchObject({
      item: { title: 'Blade Runner', imageUrl: 'https://image.tmdb.org/t/p/w342/br.jpg' },
      nominatedBy: 'ada',
      isMine: true,
    });

    const duplicate = await call<ErrorDto>(
      nominate,
      'POST',
      '/api/lists/best-sci-fi/entries',
      bob,
      {
        externalId: '78',
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('lists.already-nominated');

    const unknown = await call<ErrorDto>(nominate, 'POST', '/api/lists/best-sci-fi/entries', bob, {
      externalId: '424242',
    });
    expect(unknown.status).toBe(404);

    const detail = await call<ListDetailDto>(getList, 'GET', `/api/lists/${list.id}`, bob);
    expect(
      detail.body.entries.map((entry) => [entry.item.title, entry.nominatedBy, entry.isMine]),
    ).toEqual([['Blade Runner', 'ada', false]]);
    expect(detail.body.viewer).toEqual({
      canParticipate: true,
      canNominate: true,
      nominationsUsed: 0,
    });
  });
});

describe('a free-text list', () => {
  test('withdrawal hides a rated item and its public scores, refunds its slot, and restores earlier votes', async () => {
    await openList({
      title: 'Games',
      slug: 'games',
      itemSource: { kind: 'freeform' },
      maxNominationsPerMember: 1,
      scoreVisibility: 'public',
      ranking: { strategy: 'bayesian', minVotes: 1 },
    });
    const first = await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, {
      title: 'Root',
    });
    const input = { entryId: first.body.id, token: first.body.withdrawalToken };
    await call(changeScore, 'PUT', '/api/lists/games/ballot', ada, {
      entryId: first.body.id,
      score: 7,
    });
    await call(changeScore, 'PUT', '/api/lists/games/ballot', bob, {
      entryId: first.body.id,
      score: 9,
    });
    const before = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      ada,
    );
    expect(!before.body.hidden && before.body.rows[0]?.votes).toBe(2);
    expect(
      (await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', bob, input))
        .status,
    ).toBe(403);
    expect(
      (await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', ada, input))
        .status,
    ).toBe(204);
    const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/games', ada);
    expect(detail.body.entries).toEqual([]);
    expect(detail.body.viewer.nominationsUsed).toBe(0);
    const hidden = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      ada,
    );
    expect(!hidden.body.hidden && hidden.body.rows).toEqual([]);
    expect(
      (await call<PublicScoresDto>(getPublicScores, 'GET', '/api/lists/games/scores', ada)).body,
    ).toEqual({ visible: true, entries: {} });
    expect(
      (
        await call(changeScore, 'PUT', '/api/lists/games/ballot', bob, {
          entryId: first.body.id,
          score: 5,
        })
      ).status,
    ).toBe(404);
    const restored = await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', bob, {
      title: 'root',
    });
    expect(restored.status).toBe(201);
    expect(restored.body.id).toBe(first.body.id);
    expect(restored.body.nominatedBy).toBe('bob');
    const board = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      ada,
    );
    expect(!board.body.hidden && board.body.rows[0]).toMatchObject({ votes: 2 });
    expect(
      (await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games/ballot', ada)).body.scores[
        first.body.id
      ],
    ).toBe(7);
    const own = await call<ListDetailDto>(getList, 'GET', '/api/lists/games', ada);
    expect(own.body.viewer.nominationsUsed).toBe(0);
    expect(
      (await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', ada, input))
        .status,
    ).toBe(409);
  });

  test('withdrawal reveals no voting information on an after-close list, and erasure deletes retained scores', async () => {
    await openList({
      title: 'Games',
      slug: 'games',
      itemSource: { kind: 'freeform' },
      resultsVisibility: 'after-close',
    });
    const first = await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, {
      title: 'Root',
    });
    await call(changeScore, 'PUT', '/api/lists/games/ballot', bob, {
      entryId: first.body.id,
      score: 9,
    });
    const input = { entryId: first.body.id, token: first.body.withdrawalToken };
    expect(
      (await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', ada, input))
        .status,
    ).toBe(204);
    expect(
      (await call<LeaderboardDto>(getLeaderboard, 'GET', '/api/lists/games/leaderboard', admin))
        .body,
    ).toEqual({ hidden: true, revealsAt: CLOSES });
    const data = await call<MyDataExportDto>(exportMyData, 'GET', '/api/me/export', bob);
    expect(JSON.stringify(data.body)).toContain(first.body.id);
    await call(deleteMyData, 'DELETE', '/api/me', bob);
    await call(nominate, 'POST', '/api/lists/games/entries', ada, { title: 'Root' });
    await call(closeVoting, 'POST', '/api/lists/games/close', admin);
    const board = await call<LeaderboardDto>(
      getLeaderboard,
      'GET',
      '/api/lists/games/leaderboard',
      ada,
    );
    expect(!board.body.hidden && board.body.rows[0]?.votes).toBe(0);
  });

  test('withdrawal rejects foreign origins, anonymous callers and malformed input', async () => {
    await openList({ title: 'Games', slug: 'games', itemSource: { kind: 'freeform' } });
    const first = await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, {
      title: 'Root',
    });
    const input = { entryId: first.body.id, token: first.body.withdrawalToken };
    expect(
      (await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', null, input))
        .status,
    ).toBe(401);
    expect(
      (
        await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', ada, {
          ...input,
          extra: true,
        })
      ).status,
    ).toBe(422);
    const foreign = await withdrawNomination(
      request('POST', '/api/lists/games/entries/withdraw', {
        cookies: { [SESSION_COOKIE]: ada },
        origin: 'https://evil.example',
        body: input,
      }),
      h.app,
    );
    expect(foreign.status).toBe(403);
  });

  test('takes typed titles and catches duplicates however they are typed', async () => {
    await openList({ title: 'Best Board Games', slug: 'games', itemSource: { kind: 'freeform' } });
    const first = await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, {
      title: '  Twilight   Imperium ',
    });
    expect(first.body.item.title).toBe('Twilight Imperium');
    const again = await call<ErrorDto>(nominate, 'POST', '/api/lists/games/entries', bob, {
      title: 'twilight imperium',
    });
    expect(again.body.error.code).toBe('lists.already-nominated');
  });
});

describe('preset lists', () => {
  const importAlbums = async () =>
    call<PresetImportedDto>(importPreset, 'POST', '/api/catalog/presets', admin, {
      csv: 'title,subtitle\nOK Computer,Radiohead\nKid A,Radiohead\nBlue,Joni Mitchell\n',
    });

  test('an Admin imports a CSV; problems come back by row', async () => {
    expect((await importAlbums()).body).toMatchObject({ count: 3 });
    const bad = await call<ErrorDto>(importPreset, 'POST', '/api/catalog/presets', admin, {
      csv: 'title\nBlue\nblue',
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details).toEqual(['Row 3: duplicates row 2.']);
    expect(
      (await call(importPreset, 'POST', '/api/catalog/presets', ada, { csv: 'title\nx' })).status,
    ).toBe(403);
  });

  test('seeded: every row is an entry from the start, and nominations are refused', async () => {
    const { presetId } = (await importAlbums()).body;
    await openList({
      title: 'Rank these albums',
      slug: 'albums',
      itemSource: { kind: 'preset', presetId },
      entryMode: 'seeded',
    });
    const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/albums', ada);
    expect(detail.body.entries.map((entry) => entry.item.title)).toEqual([
      'Blue',
      'Kid A',
      'OK Computer',
    ]);
    expect(detail.body.viewer.canNominate).toBe(false);
    const refused = await call<ErrorDto>(nominate, 'POST', '/api/lists/albums/entries', ada, {
      externalId: 'blue',
    });
    expect(refused.status).toBe(403);
  });

  test('pool: members search the preset and nominate from it', async () => {
    const { presetId } = (await importAlbums()).body;
    await openList({
      title: 'Pick albums',
      slug: 'pool',
      itemSource: { kind: 'preset', presetId },
    });
    const search = await call<SearchResultsDto>(
      searchForList,
      'GET',
      '/api/lists/pool/search?q=radio',
      ada,
    );
    expect(search.body.items.map((item) => item.title)).toEqual(['OK Computer', 'Kid A']);
    expect(
      (await call(nominate, 'POST', '/api/lists/pool/entries', ada, { externalId: 'kid a' }))
        .status,
    ).toBe(201);
  });

  test('a free-text or TMDB list cannot be seeded', async () => {
    const result = await call<ErrorDto>(createList, 'POST', '/api/lists', admin, {
      title: 'x',
      slug: 'x',
      itemSource: { kind: 'freeform' },
      entryMode: 'seeded',
    });
    expect(result.body.error.code).toBe('catalog.cannot-seed');
  });
});

describe('list settings', () => {
  test('accepts unlimited nominations and several required roles', async () => {
    const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Club picks',
      slug: 'club',
      itemSource: { kind: 'freeform' },
      maxNominationsPerMember: null,
      requiredRoleIds: ['900000000000000077', '900000000000000078'],
    });
    expect(created.body).toMatchObject({
      maxNominationsPerMember: null,
      requiredRoleIds: ['900000000000000077', '900000000000000078'],
    });
  });

  test('role IDs must be Discord IDs, not role names', async () => {
    const result = await call<ErrorDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Club picks',
      slug: 'club',
      itemSource: { kind: 'freeform' },
      requiredRoleIds: ['Moderators'],
    });
    expect(result.status).toBe(422);
    expect(result.body.error.details).toEqual(['requiredRoleIds.0: must be a Discord role ID']);
  });

  test('public scores are selected on a draft and can only be disabled after publishing', async () => {
    const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Rated games',
      slug: 'rated-games',
      itemSource: { kind: 'freeform' },
    });
    const enabled = await call<ListDto>(
      setScoreVisibility,
      'PUT',
      `/api/lists/${created.body.id}/score-visibility`,
      admin,
      { scoreVisibility: 'public' },
    );
    expect(enabled.body.scoreVisibility).toBe('public');
    expect(
      (
        await call(
          setScoreVisibility,
          'PUT',
          `/api/lists/${created.body.id}/score-visibility`,
          ada,
          {
            scoreVisibility: 'private',
          },
        )
      ).status,
    ).toBe(403);

    const published = await call<ListDto>(
      scheduleList,
      'POST',
      `/api/lists/${created.body.id}/schedule`,
      admin,
      { opensAt: OPENS, nominationsCloseAt: null, closesAt: CLOSES },
    );
    expect(published.body.scoreVisibility).toBe('public');
    expect(
      (
        await call<ErrorDto>(
          setScoreVisibility,
          'PUT',
          `/api/lists/${created.body.id}/score-visibility`,
          admin,
          { scoreVisibility: 'public' },
        )
      ).body.error.code,
    ).toBe('lists.scores-private-only');
    const madePrivate = await call<ListDto>(
      setScoreVisibility,
      'PUT',
      `/api/lists/${created.body.id}/score-visibility`,
      admin,
      { scoreVisibility: 'private' },
    );
    expect(madePrivate.body.scoreVisibility).toBe('private');
    expect(
      (
        await call(
          setScoreVisibility,
          'PUT',
          `/api/lists/${created.body.id}/score-visibility`,
          admin,
          {
            scoreVisibility: 'public',
          },
        )
      ).status,
    ).toBe(422);
  });
});

describe('validation and access', () => {
  test('a malformed body lists every problem', async () => {
    const result = await call<ErrorDto>(createList, 'POST', '/api/lists', admin, {
      title: 'x',
      itemSource: { kind: 'vhs-tapes' },
      surprise: true,
    });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe('http.invalid-input');
    expect(result.body.error.details?.length).toBeGreaterThanOrEqual(3);
  });

  test('domain rules are reported with every broken field', async () => {
    const result = await call<ErrorDto>(createList, 'POST', '/api/lists', admin, {
      title: ' ',
      slug: 'Bad Slug',
      itemSource: { kind: 'freeform' },
    });
    expect(result.body.error.code).toBe('lists.invalid-config');
    expect(result.body.error.details).toHaveLength(2);
  });

  test('mutations need the site Origin; reads need a signed-in member', async () => {
    const foreign = await createList(
      request('POST', '/api/lists', {
        cookies: { [SESSION_COOKIE]: admin },
        origin: 'https://evil.example',
        body: { title: 'x', slug: 'x', itemSource: { kind: 'freeform' } },
      }),
      h.app,
    );
    expect(foreign.status).toBe(403);
    expect((await call(listLists, 'GET', '/api/lists', null)).status).toBe(401);
    expect(
      (
        await call(createList, 'POST', '/api/lists', ada, {
          title: 'x',
          slug: 'x',
          itemSource: { kind: 'freeform' },
        })
      ).status,
    ).toBe(403);
  });

  test('a scheduled list locks everything but the description and a later close', async () => {
    const list = await openList({
      title: 'Locked',
      slug: 'locked',
      itemSource: { kind: 'freeform' },
    });
    const locked = await call<ErrorDto>(editList, 'PUT', `/api/lists/${list.id}`, admin, {
      title: 'Renamed',
      scale: { min: 0, max: 5 },
    });
    expect(locked.status).toBe(422);
    expect(locked.body.error.details).toEqual(['title', 'scale']);
    const allowed = await call<ListDto>(editList, 'PUT', `/api/lists/${list.id}`, admin, {
      description: 'Now with rules',
      closesAt: '2026-02-01T00:00:00.000Z',
    });
    expect(allowed.body.schedule?.closesAt).toBe('2026-02-01T00:00:00.000Z');
    const archived = await call<ListDto>(
      archiveList,
      'POST',
      `/api/lists/${list.id}/archive`,
      admin,
    );
    expect(archived.body.lifecycle).toBe('archived');
  });
});

describe('my data covers lists', () => {
  test('export lists my nominations; erasure keeps the entry but drops my name', async () => {
    await openList({ title: 'Games', slug: 'games', itemSource: { kind: 'freeform' } });
    await call(nominate, 'POST', '/api/lists/games/entries', ada, { title: 'Root' });

    const exported = await call<MyDataExportDto>(exportMyData, 'GET', '/api/me/export', ada);
    expect(exported.body.lists).toMatchObject({ nominations: [{ title: 'Root' }] });

    expect((await call(deleteMyData, 'DELETE', '/api/me', ada)).status).toBe(204);
    const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/games', bob);
    expect(detail.body.entries.map((entry) => [entry.item.title, entry.nominatedBy])).toEqual([
      ['Root', null],
    ]);
  });
});

describe('open-ended lists, closing voting and visibility', () => {
  test('a list can be published right away with no end date, then closed by an Admin', async () => {
    const created = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Forever',
      slug: 'forever',
      itemSource: { kind: 'freeform' },
    });
    const published = await call<ListDto>(
      scheduleList,
      'POST',
      `/api/lists/${created.body.id}/schedule`,
      admin,
      {
        opensAt: OPENS,
        nominationsCloseAt: null,
        closesAt: null,
      },
    );
    expect(published.body.lifecycle).toBe('open');
    expect(published.body.schedule?.closesAt).toBeNull();

    expect((await call(closeVoting, 'POST', '/api/lists/forever/close', ada)).status).toBe(403);
    const closed = await call<ListDto>(closeVoting, 'POST', '/api/lists/forever/close', admin);
    expect(closed.body.lifecycle).toBe('closed');
  });

  test('a hidden list is not found for members until it is public again', async () => {
    await openList({ title: 'Secret', slug: 'secret', itemSource: { kind: 'freeform' } });
    const hidden = await call<ListDto>(
      setVisibility,
      'PUT',
      '/api/lists/secret/visibility',
      admin,
      {
        visibility: 'hidden',
      },
    );
    expect(hidden.body.visibility).toBe('hidden');
    expect((await call(getList, 'GET', '/api/lists/secret', ada)).status).toBe(404);
    expect(
      (
        await call(setVisibility, 'PUT', '/api/lists/secret/visibility', ada, {
          visibility: 'public',
        })
      ).status,
    ).toBe(403);
    await call(setVisibility, 'PUT', '/api/lists/secret/visibility', admin, {
      visibility: 'public',
    });
    expect((await call(getList, 'GET', '/api/lists/secret', ada)).status).toBe(200);
  });
});
