// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { InsightsDto } from '../../server/http/contracts.ts';
import { createAppRouter } from '../router.ts';
import { navigation } from '../services/api.ts';
import { session } from '../state/session.ts';
import { stubApi } from '../testing/fixtures.ts';
import InsightsPage from './InsightsPage.vue';

const data: InsightsDto = {
  computedAt: '2026-01-01T12:00:00Z',
  includedLists: 1,
  excludedLists: 1,
  totals: {
    entries: 3,
    ratings: 3,
    voters: 2,
    nominators: 1,
    ratedEntries: 2,
    readyEntries: 1,
    withdrawnEntries: 1,
    setAsideEntries: 1,
  },
  lists: [
    {
      id: 'one',
      title: 'Weekend favourites',
      slug: 'weekend',
      lifecycle: 'open',
      visibility: 'public',
      source: 'freeform',
      entryMode: 'nominations',
      status: 'available',
      minVotes: 2,
      metrics: {
        entries: 3,
        ratings: 3,
        voters: 2,
        nominators: 1,
        ratedEntries: 2,
        readyEntries: 1,
        withdrawnEntries: 1,
        setAsideEntries: 1,
      },
      distribution: [
        { ratings: 0, entries: 1 },
        { ratings: 1, entries: 1 },
        { ratings: 2, entries: 1 },
      ],
    },
    {
      id: 'secret',
      title: 'Surprise results',
      slug: 'secret',
      lifecycle: 'open',
      visibility: 'hidden',
      source: 'preset',
      entryMode: 'seeded',
      status: 'after-close',
      revealsAt: null,
    },
  ],
};
const render = async (path = '/admin/insights') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/insights', name: 'insights', component: InsightsPage },
      { path: '/lists/:slug', name: 'list', component: { render: () => null } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(InsightsPage, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test('overview explains scope, distinguishes people from ratings, and links to list insights', async () => {
  stubApi({ 'GET /api/admin/insights': () => Response.json(data) });
  const { wrapper } = await render();
  expect(wrapper.get('h1').text()).toBe('Community insights');
  expect(wrapper.text()).toContain('67%');
  expect(wrapper.text()).toContain('1.5');
  expect(wrapper.text()).toContain('1 list excluded');
  expect(wrapper.text()).toContain('Results after close');
  expect(wrapper.get('a[href="/admin/insights?list=weekend"]').text()).toContain(
    'Weekend favourites',
  );
  expect(wrapper.findAll('svg rect').every((rect) => !rect.attributes('style'))).toBe(true);
  await wrapper.get('details summary').trigger('click');
  expect(wrapper.text()).toContain('not lifetime activity');
  wrapper.unmount();
});
test('per-list view displays count distribution and no fake zeros for an embargoed list', async () => {
  stubApi({
    'GET /api/admin/insights': () =>
      Response.json({ ...data, excludedLists: 0, lists: [data.lists[0]] }),
  });
  const { wrapper, router } = await render('/admin/insights?list=weekend');
  expect(wrapper.get('h1').text()).toBe('Weekend favourites');
  expect(wrapper.text()).toContain('Ratings per entry');
  expect(wrapper.get('table caption').text()).toContain('Ratings per entry');
  stubApi({
    'GET /api/admin/insights': () =>
      Response.json({ ...data, includedLists: 0, lists: [data.lists[1]] }),
  });
  await router.push('/admin/insights?list=secret');
  await flushPromises();
  expect(wrapper.text()).toContain('Voting is open-ended');
  expect(wrapper.find('.insights-hero').exists()).toBe(false);
  expect(wrapper.find('table').exists()).toBe(false);
  wrapper.unmount();
});
test('failure is not an empty dashboard and refresh retries', async () => {
  let failed = true;
  stubApi({
    'GET /api/admin/insights': () =>
      failed
        ? Response.json(
            { error: { code: 'insights.unavailable', message: 'Insights unavailable.' } },
            { status: 503 },
          )
        : Response.json({ ...data, includedLists: 0, excludedLists: 0, lists: [] }),
  });
  const { wrapper } = await render();
  expect(wrapper.get('[role=alert]').text()).toContain('Insights unavailable');
  expect(wrapper.text()).not.toContain('No lists yet');
  failed = false;
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('No lists yet');
  wrapper.unmount();
});
test('outdated responses never overwrite the current selection', async () => {
  let finish: (response: Response) => void = () => {
    throw new Error('No request');
  };
  vi.stubGlobal('fetch', (url: string) =>
    url.includes('list=')
      ? Promise.resolve(Response.json({ ...data, lists: [data.lists[0]] }))
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  const { wrapper, router } = await render();
  expect(wrapper.text()).toContain('Loading insights');
  await router.push('/admin/insights?list=weekend');
  await flushPromises();
  finish(Response.json({ ...data, lists: [] }));
  await flushPromises();
  expect(wrapper.get('h1').text()).toBe('Weekend favourites');
  wrapper.unmount();
});

test('the real route signs visitors in and keeps ordinary members out of insights', async () => {
  session.loaded = true;
  session.me = null;
  stubApi({ 'GET /api/me': () => Response.json({}, { status: 401 }) });
  const navigate = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
  const signedOut = createAppRouter(createMemoryHistory());
  await signedOut.push('/admin/insights?list=weekend');
  expect(navigate).toHaveBeenCalledWith(
    '/api/auth/login?returnTo=%2Fadmin%2Finsights%3Flist%3Dweekend',
  );
  session.me = { id: 'member', displayName: 'Member', avatarUrl: '', isAdmin: false };
  const member = createAppRouter(createMemoryHistory());
  await member.push('/admin/insights');
  expect(member.currentRoute.value.name).toBe('lists');
});
