// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { LeaderboardDto, ListDetailDto } from '../../server/http/contracts.ts';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import { session } from '../state/session.ts';
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
const rootBoard = (): Extract<LeaderboardDto, { hidden: false }> => ({
  hidden: false,
  computedAt: new Date().toISOString(),
  minVotes: 2,
  rows: [
    {
      entryId: 'a',
      item: item('Root'),
      rank: 1,
      score: 8,
      votes: 3,
      provisional: false,
      votesNeeded: 0,
    },
  ],
});

const mountWith = async (list: ListDetailDto, board: LeaderboardDto) => {
  stubApi({
    'GET /api/lists/games': () => Response.json(list),
    'GET /api/lists/games/leaderboard': () => Response.json(board),
    'GET /api/lists/games/ballot': () => Response.json({ listId: list.id, scores: {} }),
    'GET /api/lists/games/scores': () => Response.json({ visible: false }),
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
  session.me = null;
});

describe('ListResultsPage', () => {
  test.each([
    ['open', true, false, true, true],
    ['closed', true, false, true, true],
    ['archived', true, false, false, true],
    ['open', false, false, false, false],
    ['open', true, true, false, false],
  ] as const)(
    'entry management on %s lists (Admin: %s, paused: %s)',
    async (lifecycle, isAdmin, participationPaused, canSetAside, canDelete) => {
      session.me = { id: 'viewer', displayName: 'Viewer', avatarUrl: '/favicon.svg', isAdmin };
      const page = await mountWith(
        games({
          lifecycle,
          participationPaused,
          entries: [{ ...entry('a', 'Root', null), deletionToken: 'incarnation' }],
        }),
        rootBoard(),
      );
      await page.get('.standing__title-button').trigger('click');
      expect(page.find('button[aria-label="Permanently delete Root"]').exists()).toBe(canDelete);
      expect(page.findAll('button').some((button) => button.text() === 'Set aside...')).toBe(
        canSetAside,
      );
      page.unmount();
    },
  );

  test('set-aside changes and deletion from results refresh all results data', async () => {
    session.me = { id: 'admin', displayName: 'Admin', avatarUrl: '/favicon.svg', isAdmin: true };
    const root = { ...entry('a', 'Root', null), deletionToken: 'incarnation' };
    let detail = games({ entries: [root] });
    let board = rootBoard();
    const page = await mountWith(detail, board);
    const calls = stubApi({
      'GET /api/lists/games': () => Response.json(detail),
      'GET /api/lists/games/leaderboard': () => Response.json(board),
      'GET /api/lists/games/ballot': () => Response.json({ listId: detail.id, scores: {} }),
      'GET /api/lists/games/scores': () => Response.json({ visible: false }),
      'PUT /api/lists/list-1/entries/set-aside': ({ body }) => {
        expect(body).toEqual({
          entryId: 'a',
          token: 'incarnation',
          expectedReason: null,
          reason: 'Outside the criteria',
        });
        const updated = { ...root, setAsideReason: 'Outside the criteria' };
        detail = { ...detail, entries: [updated] };
        return Response.json(updated);
      },
      'POST /api/lists/list-1/entries/delete': ({ body }) => {
        expect(body).toEqual({ entryId: 'a', token: 'incarnation', confirmation: 'Root' });
        detail = { ...detail, entries: [] };
        board = { ...rootBoard(), rows: [] };
        return new Response(null, { status: 204 });
      },
    });
    await page.get('.standing__title-button').trigger('click');
    await page
      .findAll('button')
      .find((button) => button.text() === 'Set aside...')
      ?.trigger('click');
    await page.get('textarea').setValue('Outside the criteria');
    await page.get('form').trigger('submit');
    await flushPromises();
    expect(page.find('.podium .set-aside-notice__reason').exists()).toBe(false);
    expect(page.get('.podium .set-aside-notice').text()).toContain('Set aside');
    await page.get('.standing__title-button').trigger('click');
    await page.get('button[aria-label="Permanently delete Root"]').trigger('click');
    const confirm = page.get('.dialog__actions .button--danger');
    expect(confirm.attributes('disabled')).toBeDefined();
    await page.get('.dialog__confirm input').setValue('Root');
    await confirm.trigger('click');
    await flushPromises();
    expect(page.find('.standing__title-button').exists()).toBe(false);
    expect(calls.filter((call) => call.url.endsWith('/leaderboard'))).toHaveLength(2);
    expect(calls.filter((call) => call.url.endsWith('/ballot'))).toHaveLength(2);
    page.unmount();
  });

  test.each(['separate', 'combined'])(
    'Admins can restore set-aside entries from the %s results',
    async (mode) => {
      session.me = { id: 'admin', displayName: 'Admin', avatarUrl: '/favicon.svg', isAdmin: true };
      const root = {
        ...entry('a', 'Root', null),
        deletionToken: 'incarnation',
        setAsideReason: 'Outside criteria',
      };
      let detail = games({ lifecycle: 'closed', entries: [root] });
      const ranked = rootBoard();
      let board: LeaderboardDto = { ...ranked, groups: { main: [], setAside: ranked.rows } };
      const page = await mountWith(detail, board);
      const calls = stubApi({
        'GET /api/lists/games': () => Response.json(detail),
        'GET /api/lists/games/leaderboard': () => Response.json(board),
        'GET /api/lists/games/ballot': () => Response.json({ listId: detail.id, scores: { a: 8 } }),
        'GET /api/lists/games/scores': () => Response.json({ visible: false }),
        'PUT /api/lists/list-1/entries/set-aside': ({ body }) => {
          expect(body).toEqual({
            entryId: 'a',
            token: 'incarnation',
            expectedReason: 'Outside criteria',
            reason: null,
          });
          const updated = { ...root, setAsideReason: null };
          detail = { ...detail, entries: [updated] };
          board = rootBoard();
          return Response.json(updated);
        },
      });
      if (mode === 'combined') await page.get('input[value=combined]').setValue(true);
      await page.get('.standing__title-button').trigger('click');
      expect(page.find('button[aria-label="Permanently delete Root"]').exists()).toBe(true);
      await page
        .findAll('button')
        .find((button) => button.text() === 'Edit set-aside status...')
        ?.trigger('click');
      expect(page.text()).toContain('changes the final standings');
      await page
        .findAll('button')
        .find((button) => button.text() === 'Return to main ranking')
        ?.trigger('click');
      await flushPromises();
      expect(page.find('.set-aside-ranking').exists()).toBe(false);
      expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
      page.unmount();
    },
  );

  test('pending deletion on results reports cleanup errors and can be retried', async () => {
    session.me = { id: 'admin', displayName: 'Admin', avatarUrl: '/favicon.svg', isAdmin: true };
    let detail = games({
      lifecycle: 'archived',
      participationPaused: true,
      entryDeletion: { entryId: 'a', token: 'incarnation', title: 'Root' },
    });
    const page = await mountWith(detail, rootBoard());
    let attempts = 0;
    stubApi({
      'GET /api/lists/games': () => Response.json(detail),
      'GET /api/lists/games/leaderboard': () => Response.json(rootBoard()),
      'GET /api/lists/games/ballot': () => Response.json({ listId: detail.id, scores: {} }),
      'GET /api/lists/games/scores': () => Response.json({ visible: false }),
      'POST /api/lists/list-1/entries/delete': () => {
        attempts += 1;
        if (attempts === 1)
          return Response.json(
            {
              error: { code: 'lists.deletion-busy', message: 'Earlier writes must finish.' },
            },
            { status: 409 },
          );
        detail = { ...detail, participationPaused: false, entryDeletion: null, entries: [] };
        return new Response(null, { status: 204 });
      },
    });
    await page.get('.notice button').trigger('click');
    expect(page.text()).toContain('Deletion changes its final results');
    await page.get('.dialog__confirm input').setValue('Root');
    const confirm = page.get('.dialog__actions .button--danger');
    await confirm.trigger('click');
    await flushPromises();
    expect(page.text()).toContain('Earlier writes must finish.');
    expect(page.find('.notice button').exists()).toBe(true);
    await confirm.trigger('click');
    await flushPromises();
    expect(attempts).toBe(2);
    expect(page.find('.notice button').exists()).toBe(false);
    page.unmount();
  });

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
      '1 Root 7.7 · 2 votes Nominated by Ada + Rate',
    ]);
    const cells = (row: { element: Element }) =>
      [...row.element.children]
        .filter((cell) => !cell.classList.contains('ranking__art'))
        .map((cell) => squash(cell.textContent))
        .join(' | ');
    expect(page.findAll('.standings__provisional li').map(cells)).toEqual([
      '– | Wingspan, Needs 1 more vote Nominated by Bob | 8.0 · 1 vote + Rate',
    ]);
    expect(page.findAll('.standings__unrated li').map(cells)).toEqual([
      '– | Azul | No votes yet + Rate',
      '– | Catan Nominated by Ada | No votes yet + Rate',
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

  test('allows rating an unrated entry directly from results page', async () => {
    vi.useFakeTimers();
    const calls: unknown[] = [];
    stubApi({
      'GET /api/lists/games': () => Response.json(games({ writeRevision: 'after-deletion' })),
      'GET /api/lists/games/leaderboard': () =>
        Response.json({
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
          ],
        }),
      'GET /api/lists/games/ballot': () => Response.json({ listId: 'games', scores: {} }),
      'GET /api/lists/games/scores': () => Response.json({ visible: false }),
    });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        expect(input).toBe('/api/lists/list-1/ballot');
        calls.push(JSON.parse(init.body as string));
        return Promise.resolve(Response.json({ listId: 'games', scores: { a: 8 } }));
      }
      return original(input, init);
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
    const page = mount(ListResultsPage, {
      global: { plugins: [router] },
      attachTo: document.body,
    });
    await flushPromises();

    try {
      const rateButton = page.get('.standing__rate-button');
      await rateButton.trigger('click');

      const dialog = page.get('dialog');
      expect(dialog.element.open).toBe(true);
      expect(dialog.find('.score-input').exists()).toBe(true);

      await dialog.get('.score-input input[value="8"]').setValue(true);
      await vi.advanceTimersByTimeAsync(250);
      await flushPromises();

      expect(calls).toEqual([{ entryId: 'a', score: 8, revision: 'after-deletion' }]);
    } finally {
      vi.useRealTimers();
      page.unmount();
    }
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
