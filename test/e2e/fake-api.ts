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
  demo: true,
  backups: true,
};

const entry = (id: string, title: string, subtitle: string | null): EntryDto => ({
  id,
  item: { source: 'freeform', externalId: id, title, subtitle, imageUrl: null },
  nominatedBy: 'Someone With A Long Name',
  isMine: id === 'b',
  nominatedAt: '2026-01-01T00:00:00.000Z',
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
  'GET /api/catalog/sources': { sources: ['tmdb-movie', 'freeform', 'preset'] },
});

/** Serves every `/api/` request from the fake API; `me: null` is a signed-out visitor. */
export const fakeApi = async (page: Page, me: MeDto | null) => {
  const routes = responses(me);
  await page.route('**/api/**', (route: Route) => {
    const url = new URL(route.request().url());
    const body = routes[`${route.request().method()} ${url.pathname}`];
    if (body === null) return route.fulfill({ status: 401, json: notFound });
    if (body === undefined) return route.fulfill({ status: 404, json: notFound });
    return route.fulfill({ json: body });
  });
};
