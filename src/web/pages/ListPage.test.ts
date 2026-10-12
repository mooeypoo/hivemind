// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { LeaderboardDto, ListDetailDto } from '../../server/http/contracts.ts';
import { useToast } from '../composables/toast.ts';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import ListPage from './ListPage.vue';

const Blank = { render: () => null };
const entry = (id: string, title: string) => ({
  id,
  item: { source: 'freeform', externalId: id, title, subtitle: null, imageUrl: null },
  nominatedBy: null,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
});

const mountWith = async (
  list: ListDetailDto,
  scores: Record<string, number> = {},
  board: LeaderboardDto = { hidden: true, revealsAt: null },
  attach = false,
) => {
  stubApi({
    'GET /api/lists/games': () => Response.json(list),
    'GET /api/lists/games/ballot': () => Response.json({ listId: list.id, scores }),
    'GET /api/lists/games/scores': () =>
      Response.json(
        list.scoreVisibility === 'public'
          ? {
              visible: true,
              entries: { a: [{ displayName: 'Ada', score: 9 }] },
            }
          : { visible: false },
      ),
    'GET /api/lists/games/leaderboard': () => Response.json(board),
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lists/:slug', name: 'list', component: ListPage },
      { path: '/lists/:slug/results', name: 'list-results', component: Blank },
      { path: '/admin/lists/:slug', name: 'edit-list', component: Blank },
    ],
  });
  await router.push('/lists/games');
  await router.isReady();
  const page = mount(ListPage, {
    global: { plugins: [router] },
    ...(attach ? { attachTo: document.body } : {}),
  });
  await flushPromises();
  return page;
};

const games = (overrides: Partial<ListDetailDto>) =>
  openTmdbList({
    slug: 'games',
    itemSource: { kind: 'freeform' },
    entries: [entry('a', 'Root'), entry('b', 'Wingspan')],
    ...overrides,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListPage rating', () => {
  test('an open list shows score chips per entry and how many you have rated', async () => {
    const page = await mountWith(games({}), { a: 4 });
    expect(page.get('#entries-heading').text()).toContain('All community nominations');
    expect(page.text()).toContain('including entries nominated by other members');
    expect(page.text()).toContain('You can rate any entry while voting is open.');
    expect(page.findAll('.score-input')).toHaveLength(2);
    expect(page.findAll('.score-input')[0]?.findAll('input[type="radio"]')).toHaveLength(10);
    expect(page.text()).toContain('1 of 2 rated');
    expect(page.text()).toContain('Your scores are private');
  });

  test('an unrated entry has no score selected, rather than looking like the lowest score', async () => {
    const page = await mountWith(games({}), { a: 4 });
    const [rated, unrated] = page.findAll('.score-input');
    expect(rated?.find<HTMLInputElement>('input:checked').element.value).toBe('4');
    expect(unrated?.find('input:checked').exists()).toBe(false);
    expect(unrated?.text()).toContain('Not rated');
  });

  test('sections are tabs, with Rate first and the others hidden', async () => {
    const page = await mountWith(games({}));
    expect(page.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      'Rate 2',
      'Standings',
      'Nominate',
    ]);
    expect(page.get('[role="tab"][aria-selected="true"]').text()).toContain('Rate');
    expect((page.get('.list-nominate').element as HTMLElement).style.display).toBe('none');
    await page.findAll('[role="tab"]')[2]?.trigger('click');
    await flushPromises();
    expect((page.get('.list-nominate').element as HTMLElement).style.display).toBe('');
  });

  test('choosing a score saves it to your ballot', async () => {
    vi.useFakeTimers();
    const page = await mountWith(games({}));
    const calls: unknown[] = [];
    const fetch = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        calls.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ listId: 'list-1', scores: { a: 8 } }));
      }
      return fetch(input, init);
    });
    await page.get('.score-input input[value="8"]').setValue(true);
    expect(page.text()).toContain('1 of 2 rated');
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(calls).toEqual([{ entryId: 'a', score: 8 }]);
    vi.useRealTimers();
  });

  test('rate one by one walks through the unrated entries', async () => {
    const page = await mountWith(games({}), { a: 4 }, undefined, true);
    await page.get('.ballot-bar .button--primary').trigger('click');
    const stage = page.get('.dialog--stage');
    expect(stage.text()).toContain('1 of 1');
    expect(stage.get('.one-by-one__title').text()).toBe('Wingspan');
    await stage.findAll('.dialog__actions button').at(-1)?.trigger('click');
    expect(stage.text()).toContain('You rated 0 of 1 entry.');
    page.unmount();
  });

  test('a public list warns before rating and shows attribution when results are visible', async () => {
    const page = await mountWith(games({ scoreVisibility: 'public' }));
    expect(page.text()).toContain(
      'Scores on this list are public: other members can see the score you give each entry.',
    );
    expect(page.text()).not.toContain('Your scores are private');
    expect(page.text()).toContain('Who voted (1)');
    expect(page.text()).toContain('Ada: 9');
  });

  test('a seeded list invites you to rate', async () => {
    const page = await mountWith(games({ entryMode: 'seeded' }));
    expect(page.get('#entries-heading').text()).toContain('Rate these');
  });

  test('without a required role there is nothing to rate with', async () => {
    const page = await mountWith(
      games({ viewer: { canParticipate: false, canNominate: false, nominationsUsed: 0 } }),
    );
    expect(page.findAll('.score-input')).toHaveLength(0);
    expect(page.text()).toContain('so you can’t rate it');
  });

  test('a scheduled list has no score inputs yet', async () => {
    const page = await mountWith(games({ lifecycle: 'scheduled' }));
    expect(page.findAll('.score-input')).toHaveLength(0);
  });

  test('a closed list shows your final scores, read-only', async () => {
    const page = await mountWith(games({ lifecycle: 'closed' }), { b: 2 });
    expect(page.findAll('.score-input')).toHaveLength(0);
    expect(page.text()).toContain('Your score: 2');
  });

  test('orders the ballot by visible standings and keeps pending entries after ranked ones', async () => {
    const board: LeaderboardDto = {
      hidden: false,
      computedAt: '2026-01-01T00:00:00.000Z',
      minVotes: 3,
      rows: [
        {
          rank: 1,
          entryId: 'b',
          item: entry('b', 'Wingspan').item,
          score: 8.4,
          average: 8.6,
          votes: 5,
          provisional: false,
          votesNeeded: 0,
        },
        {
          rank: null,
          entryId: 'a',
          item: entry('a', 'Root').item,
          score: 7.2,
          average: 9,
          votes: 2,
          provisional: true,
          votesNeeded: 1,
        },
        {
          rank: null,
          entryId: 'c',
          item: entry('c', 'Azul').item,
          score: null,
          average: null,
          votes: 0,
          provisional: true,
          votesNeeded: 3,
        },
      ],
    };
    const page = await mountWith(
      games({ entries: [entry('a', 'Root'), entry('b', 'Wingspan'), entry('c', 'Azul')] }),
      {},
      board,
    );
    expect(page.findAll('.entry__title').map((title) => title.text())).toEqual([
      'Wingspan',
      'Root',
      'Azul',
    ]);
    expect(page.findAll('.entry__standing').map((standing) => standing.text())).toEqual([
      'Rank 1',
      'Needs 1 more vote for a place',
      'No votes yet',
    ]);
  });

  test('does not derive entry order from a hidden after-close leaderboard', async () => {
    const page = await mountWith(
      games({
        resultsVisibility: 'after-close',
        entries: [entry('b', 'Wingspan'), entry('a', 'Root')],
      }),
      {},
      { hidden: true, revealsAt: '2026-01-20T00:00:00.000Z' },
    );
    expect(page.findAll('.entry__title').map((title) => title.text())).toEqual([
      'Wingspan',
      'Root',
    ]);
    expect(page.findAll('.entry__standing')).toHaveLength(0);
  });

  test('copies a member-only share link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const page = await mountWith(games({}));
    await page.get('.share-link').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/lists/games');
    expect(useToast().toasts.value.at(-1)?.message).toContain('Sign-in is required');
  });
});
