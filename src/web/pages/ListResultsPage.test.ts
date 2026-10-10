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

const text = (node: { element: Element }) =>
  [...node.element.children]
    .map((child) => child.textContent.replace(/\s+/g, ' ').trim())
    .join(' | ');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListResultsPage', () => {
  test('ranks confirmed entries, then provisional, then unrated, with no personal scores', async () => {
    const page = await mountWith(games(), {
      hidden: false,
      computedAt: new Date().toISOString(),
      minVotes: 2,
      rows: [
        {
          rank: 1,
          entryId: 'b',
          item: item('Wingspan'),
          score: 8,
          average: 9,
          votes: 1,
          provisional: true,
          votesNeeded: 1,
        },
        {
          rank: 2,
          entryId: 'a',
          item: item('Root'),
          score: 7.67,
          average: 8,
          votes: 2,
          provisional: false,
          votesNeeded: 0,
        },
        {
          rank: null,
          entryId: 'c',
          item: item('Azul'),
          score: null,
          average: null,
          votes: 0,
          provisional: true,
          votesNeeded: 2,
        },
      ],
    });
    const ranked = page.findAll('[aria-labelledby="ranked-heading"] li').map(text);
    expect(ranked).toEqual(['1 | Root Nominated by Ada | 2 people voted · average 8.0']);
    const provisional = page.findAll('[aria-labelledby="provisional-heading"] li').map(text);
    expect(provisional).toEqual([
      '– | Wingspan Provisional · needs 1 more vote Nominated by Bob | 1 person voted · average 9.0',
    ]);
    const unrated = page.findAll('[aria-labelledby="unrated-heading"] li').map(text);
    expect(unrated).toEqual([
      '– | Azul | No votes yet',
      '– | Catan Nominated by Ada | No votes yet',
    ]);
    expect(page.find('input').exists()).toBe(false);
    expect(page.text()).not.toContain('you:');
  });

  test('reveals nothing while results wait for the close', async () => {
    const page = await mountWith(games({ resultsVisibility: 'after-close' }), {
      hidden: true,
      revealsAt: '2026-01-20T00:00:00.000Z',
    });
    expect(page.text()).toContain('Results are revealed when voting closes');
    expect(page.find('.ranking').exists()).toBe(false);
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
});
