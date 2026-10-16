import type { Page, Route } from '@playwright/test';
import type {
  EntryDto,
  ErrorDto,
  LeaderboardDto,
  ListDetailDto,
  MeDto,
  SiteDto,
} from '../../src/server/http/contracts.ts';

/**
 * A fake API for layout tests: the built web app runs against these responses, so the tests
 * need no Netlify, Blobs or Discord. Long titles and names on purpose, to stress narrow screens.
 */
export const admin: MeDto = {
  id: '1',
  displayName: 'An Admin With A Rather Long Display Name',
  avatarUrl: '/favicon.svg',
  isAdmin: true,
};

const site: SiteDto = {
  community: { name: 'The Midnight Screening Society', iconUrl: null, inviteUrl: 'https://x.y' },
  offersMovieData: true,
  offersTvData: true,
  offersGameData: true,
  demo: true,
  backups: true,
};

const entry = (id: string, title: string, subtitle: string | null): EntryDto => ({
  id,
  item: { source: 'freeform', externalId: id, title, subtitle, imageUrl: null },
  nominatedBy: 'Someone With A Long Name',
  isMine: id === 'b',
  nominatedAt: '2026-01-01T00:00:00.000Z',
  withdrawalToken: id === 'b' ? 'claim-b' : null,
  deletionToken: `entry-${id}`,
});

export const list: ListDetailDto = {
  id: 'list-1',
  title: 'The Greatest Science-Fiction Films Of All Time, Ranked Together',
  slug: 'films',
  description: 'Nominate the science-fiction films you love, then rate everyone’s picks.',
  itemSource: { kind: 'freeform' },
  entryMode: 'nominations',
  scale: { min: 1, max: 10 },
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  scoreVisibility: 'public',
  ranking: { strategy: 'bayesian', minVotes: 3 },
  showNominators: true,
  requiredRoleIds: [],
  lifecycle: 'open',
  visibility: 'public',
  schedule: {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: '2098-01-01T00:00:00.000Z',
    closesAt: '2099-01-01T00:00:00.000Z',
  },
  viewer: { canParticipate: true, canNominate: true, nominationsUsed: 1 },
  itemSourceEditable: false,
  entries: [
    entry('a', 'Eternal Sunshine of the Spotless Mind', '2004'),
    entry('b', 'Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb', '1964'),
    entry('c', 'Alien', null),
  ],
  snapshotsExpireAt: null,
};

const leaderboard: LeaderboardDto = {
  hidden: false,
  computedAt: new Date().toISOString(),
  minVotes: 3,
  rows: list.entries.map((e, index) => ({
    rank: index === 0 ? 1 : null,
    entryId: e.id,
    item: e.item,
    score: index === 2 ? null : 8.25 - index,
    average: index === 2 ? null : 9 - index,
    votes: index === 2 ? 0 : 4 - index * 2,
    provisional: index !== 0,
    votesNeeded: index === 0 ? 0 : 1 + index,
  })),
};

const notFound: ErrorDto = { error: { code: 'http.not-found', message: 'Not found.' } };

const responses = (me: MeDto | null): Record<string, unknown> => ({
  'GET /api/site': site,
  'GET /api/me': me,
  'GET /api/lists': { lists: [list, { ...list, id: 'list-2', slug: 'draft', lifecycle: 'draft' }] },
  'GET /api/lists/films': list,
  'GET /api/lists/films/ballot': { listId: list.id, scores: { a: 7 } },
  'GET /api/lists/films/scores': {
    visible: true,
    entries: { a: [{ displayName: 'Someone With A Long Name', score: 9 }] },
  },
  'GET /api/lists/films/leaderboard': leaderboard,
  'GET /api/roles': {
    labels: [{ roleId: '123456789012345678', name: 'Film Club' }],
    version: 'v1',
  },
  'GET /api/catalog/sources': {
    sources: ['tmdb-movie', 'tvdb-series', 'igdb-game', 'freeform', 'preset'],
  },
});

/** Serves every `/api/` request from the fake API; `me: null` is a signed-out visitor. */
export const fakeApi = async (
  page: Page,
  me: MeDto | null,
  options: {
    readonly movieSearch?: boolean;
    readonly movieDetails?: boolean;
    readonly movieStandings?: boolean;
    readonly tvSeries?: boolean;
    readonly games?: boolean;
  } = {},
) => {
  const routes = responses(me);
  if (options.games === true) {
    const item = {
      source: 'igdb-game',
      externalId: '123',
      title: 'A Game With A Very Long Title For A Small Screen',
      subtitle: '2020',
      imageUrl: '/favicon.svg',
      overview:
        'A game synopsis with enough detail to check wrapping in the review and rating dialogs.',
      developer: 'A Development Studio With A Very Long Company Name',
      publisher: 'A Publisher With A Very Long Company Name',
    };
    routes['GET /api/lists/films'] = {
      ...list,
      itemSource: { kind: 'igdb-game' },
      entries: [{ ...entry('a', item.title, item.subtitle), item }],
    };
    routes['GET /api/lists/films/ballot'] = { listId: list.id, scores: {} };
    routes['GET /api/lists/films/leaderboard'] = {
      ...leaderboard,
      rows: leaderboard.rows.slice(0, 1).map((row) => ({ ...row, item })),
    };
    routes['GET /api/lists/list-1/search'] = { items: [{ ...item, externalId: '456' }] };
    routes['GET /api/lists/list-1/item'] = { ...item, externalId: '456' };
  }
  if (options.tvSeries === true) {
    const item = {
      source: 'tvdb-series',
      externalId: '123',
      title: 'A Television Series With A Very Long Title',
      subtitle: '2020',
      imageUrl: '/favicon.svg',
      overview:
        'A series synopsis with enough detail to check wrapping in the review and rating dialogs.',
      creator: 'A Creator With A Long Name, Another Creator With A Long Name',
      cast: ['An Actor With A Long Name', 'Another Actor With A Long Name'],
    };
    const show = { ...entry('a', item.title, item.subtitle), item };
    routes['GET /api/lists/films'] = {
      ...list,
      itemSource: { kind: 'tvdb-series' },
      entries: [show],
    };
    routes['GET /api/lists/films/ballot'] = { listId: list.id, scores: {} };
    routes['GET /api/lists/films/leaderboard'] = {
      ...leaderboard,
      rows: leaderboard.rows.slice(0, 1).map((row) => ({ ...row, item })),
    };
    routes['GET /api/lists/list-1/search'] = { items: [{ ...item, externalId: '456' }] };
    routes['GET /api/lists/list-1/item'] = { ...item, externalId: '456' };
  }
  if (options.movieDetails === true || options.movieStandings === true) {
    const movie: EntryDto = {
      ...entry(options.movieStandings === true ? 'd' : 'a', 'Blade Runner', '1982'),
      item: {
        source: 'tmdb-movie',
        externalId: '78',
        title: 'Blade Runner',
        subtitle: '1982',
        imageUrl: options.movieStandings === true ? '/favicon.svg' : null,
        overview:
          'A blade runner must pursue replicants in a future Los Angeles where the line between human and machine is uncertain.',
        director: 'Ridley Scott',
        cast: ['Harrison Ford', 'Rutger Hauer'],
      },
    };
    routes['GET /api/lists/films'] = {
      ...list,
      itemSource: { kind: 'tmdb-movie' },
      entries: [movie],
    };
    routes['GET /api/lists/films/ballot'] = { listId: list.id, scores: {} };
    routes['GET /api/lists/films/leaderboard'] = {
      ...leaderboard,
      rows: leaderboard.rows
        .filter((row) => row.entryId === movie.id)
        .map((row) => ({ ...row, item: movie.item })),
    };
    if (options.movieStandings === true) {
      const entries = [...list.entries, movie];
      routes['GET /api/lists/films'] = {
        ...list,
        itemSource: { kind: 'tmdb-movie' },
        entries,
      };
      routes['GET /api/lists/films/leaderboard'] = {
        ...leaderboard,
        rows: entries.map((entry, index) => ({
          rank: index + 1,
          entryId: entry.id,
          item: entry.item,
          score: 9 - index,
          average: 9 - index,
          votes: 4,
          provisional: false,
          votesNeeded: 0,
        })),
      };
    }
  }
  if (options.movieSearch === true) {
    routes['GET /api/lists/films'] = { ...list, itemSource: { kind: 'tmdb-movie' } };
    routes['GET /api/lists/list-1/search'] = {
      items: [
        {
          source: 'tmdb-movie',
          externalId: '78',
          title: 'Blade Runner',
          subtitle: '1982',
          imageUrl: null,
          overview:
            'A blade runner must pursue replicants in a future Los Angeles where the line between human and machine is uncertain.',
          director: 'Ridley Scott',
          cast: ['Harrison Ford', 'Rutger Hauer'],
        },
      ],
    };
    routes['GET /api/lists/list-1/item'] = {
      source: 'tmdb-movie',
      externalId: '78',
      title: 'Blade Runner',
      subtitle: '1982',
      imageUrl: null,
      overview:
        'A blade runner must pursue replicants in a future Los Angeles where the line between human and machine is uncertain.',
      director: 'Ridley Scott',
      cast: ['Harrison Ford', 'Rutger Hauer'],
    };
  }
  await page.route('**/api/**', (route: Route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'POST' &&
      url.pathname === '/api/lists/films/entries/withdraw'
    ) {
      const input = route.request().postDataJSON() as { entryId: string; token: string };
      if (input.entryId !== 'b' || input.token !== 'claim-b')
        return route.fulfill({ status: 409, json: notFound });
      routes['GET /api/lists/films'] = {
        ...list,
        entries: list.entries.filter((item) => item.id !== 'b'),
        viewer: { ...list.viewer, nominationsUsed: 0 },
      };
      routes['GET /api/lists/films/leaderboard'] = {
        ...leaderboard,
        rows: leaderboard.rows.filter((row) => row.entryId !== 'b'),
      };
      return route.fulfill({ status: 204 });
    }
    const body = routes[`${route.request().method()} ${url.pathname}`];
    if (body === null) return route.fulfill({ status: 401, json: notFound });
    if (body === undefined) return route.fulfill({ status: 404, json: notFound });
    return route.fulfill({ json: body });
  });
};
