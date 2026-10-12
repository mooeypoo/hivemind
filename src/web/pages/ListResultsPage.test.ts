// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { LeaderboardDto, ListDetailDto } from '../../server/http/contracts.ts';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import ListResultsPage from './ListResultsPage.vue';

const Blank = { render: () => null };
const item = (title: string) => ({
  source: 'freeform',
  externalId: title,
  title,
  subtitle: null,
  imageUrl: null,
});
const entry = (id: string, title: string, nominatedBy: string | null) => ({
  id,
  item: item(title),
  nominatedBy,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
});

const mountWith = async (list: ListDetailDto, board: LeaderboardDto) => {
  stubApi({
    'GET /api/lists/games': () => Response.json(list),
    'GET /api/lists/games/leaderboard': () => Response.json(board),
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lists/:slug', name: 'list', component: Blank },
      { path: '/lists/:slug/results', name: 'list-results', component: ListResultsPage },
    ],
  });
  await router.push('/lists/games/results');
  await router.isReady();
  const page = mount(ListResultsPage, { global: { plugins: [router] } });
  await flushPromises();
  return page;
};

const games = (overrides: Partial<ListDetailDto> = {}) =>
  openTmdbList({
    slug: 'games',
    itemSource: { kind: 'freeform' },
    entries: [
      entry('a', 'Root', 'Ada'),
      entry('b', 'Wingspan', 'Bob'),
      entry('c', 'Azul', null),
      entry('d', 'Catan', 'Ada'),
    ],
    ...overrides,
  });
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
const placeText = (place: { element: Element }) =>
  [...place.element.children]
    .map((child) =>
      child.classList.contains('podium__art')
        ? (child.querySelector('.podium__medal')?.textContent ?? '')
        : child.textContent,
    )
    .map(squash)
    .join(' ');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListResultsPage', () => {
  test('shows the same standings as the list: provisional entries wait below the ranking, no personal scores', async () => {
    const page = await mountWith(games(), {
      hidden: false,
      computedAt: new Date().toISOString(),
      minVotes: 2,
      rows: [
        {
          rank: 1,
          entryId: 'a',
          item: item('Root'),
          score: 7.67,
          votes: 2,
          provisional: false,
          votesNeeded: 0,
        },
        {
          rank: null,
          entryId: 'b',
          item: item('Wingspan'),
          score: 8,
          votes: 1,
          provisional: true,
          votesNeeded: 1,
        },
        {
          rank: null,
          entryId: 'c',
          item: item('Azul'),
          score: null,
          votes: 0,
          provisional: true,
          votesNeeded: 2,
        },
      ],
    });
    expect(page.findAll('.podium__place').map(placeText)).toEqual([
      '1 Root 7.7 · 2 votes Nominated by Ada',
    ]);
    const cells = (row: { element: Element }) =>
      [...row.element.children]
        .filter((cell) => !cell.classList.contains('ranking__art'))
        .map((cell) => squash(cell.textContent))
        .join(' | ');
    expect(page.findAll('.standings__provisional li').map(cells)).toEqual([
      '– | Wingspan, Needs 1 more vote Nominated by Bob | 8.0 · 1 vote',
    ]);
    expect(page.findAll('.standings__unrated li').map(cells)).toEqual([
      '– | Azul | No votes yet',
      '– | Catan Nominated by Ada | No votes yet',
    ]);
    expect(page.find('input').exists()).toBe(false);
    expect(page.text()).not.toMatch(/you:/i);
  });

  test('reveals nothing while results wait for the close', async () => {
    const page = await mountWith(games({ resultsVisibility: 'after-close' }), {
      hidden: true,
      revealsAt: '2026-01-20T00:00:00.000Z',
    });
    expect(page.text()).toContain('Results are revealed when voting closes');
    expect(page.find('.podium').exists()).toBe(false);
  });

  test('calls closed lists final', async () => {
    const page = await mountWith(games({ lifecycle: 'closed' }), {
      hidden: false,
      computedAt: new Date().toISOString(),
      minVotes: 0,
      rows: [],
    });
    expect(page.text()).toContain('Final results.');
  });

  test.each([
    ['an open list you can rate', games(), true],
    ['a closed list', games({ lifecycle: 'closed' }), false],
    [
      'an open list without the required role',
      games({ viewer: { canParticipate: false, canNominate: false, nominationsUsed: 0 } }),
      false,
    ],
  ])('offers a way back to rating on %s: %s', async (_, list, offered) => {
    const page = await mountWith(list, { hidden: true, revealsAt: null });
    const rate = page.findAll('a').find((link) => link.text() === 'Rate entries');
    expect(rate !== undefined).toBe(offered);
    if (rate !== undefined) expect(rate.attributes('href')).toBe('/lists/games');
  });

  test.each([
    ['a list open for nominations', games(), true],
    [
      'a list whose nominations are closed or used up',
      games({ viewer: { canParticipate: true, canNominate: false, nominationsUsed: 3 } }),
      false,
    ],
    ['a seeded list', games({ entryMode: 'seeded' }), false],
  ])('offers a way to nominate on %s: %s', async (_, list, offered) => {
    const page = await mountWith(list, { hidden: true, revealsAt: null });
    const nominate = page.findAll('a').find((link) => link.text() === 'Nominate items');
    expect(nominate !== undefined).toBe(offered);
    if (nominate !== undefined) {
      expect(nominate.attributes('href')).toBe('/lists/games?tab=nominate');
    }
  });
});
