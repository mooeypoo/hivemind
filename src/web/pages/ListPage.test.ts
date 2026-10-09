// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ListDetailDto } from '../../server/http/contracts.ts';
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

const mountWith = async (list: ListDetailDto, scores: Record<string, number> = {}) => {
  stubApi({
    'GET /api/lists/games': () => Response.json(list),
    'GET /api/lists/games/ballot': () => Response.json({ listId: list.id, scores }),
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/lists/:slug', name: 'list', component: ListPage },
      { path: '/admin/lists/:slug', name: 'edit-list', component: Blank },
    ],
  });
  await router.push('/lists/games');
  await router.isReady();
  const page = mount(ListPage, { global: { plugins: [router] } });
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
  test('an open list shows a score picker per entry and how many you have rated', async () => {
    const page = await mountWith(games({}), { a: 4 });
    expect(page.findAll('select')).toHaveLength(2);
    expect(page.text()).toContain('You’ve rated 1 of 2');
    expect(page.text()).toContain('Your scores are private');
  });

  test('a seeded list invites you to rate', async () => {
    const page = await mountWith(games({ entryMode: 'seeded' }));
    expect(page.get('#entries-heading').text()).toContain('Rate these');
  });

  test('without a required role there is nothing to rate with', async () => {
    const page = await mountWith(
      games({ viewer: { canParticipate: false, canNominate: false, nominationsUsed: 0 } }),
    );
    expect(page.findAll('select')).toHaveLength(0);
    expect(page.text()).toContain('so you can’t rate it');
  });

  test('a scheduled list has no pickers yet', async () => {
    const page = await mountWith(games({ lifecycle: 'scheduled' }));
    expect(page.findAll('select')).toHaveLength(0);
  });

  test('a closed list shows your final scores, read-only', async () => {
    const page = await mountWith(games({ lifecycle: 'closed' }), { b: 2 });
    expect(page.findAll('select')).toHaveLength(0);
    expect(page.text()).toContain('Your score: 2');
  });
});
