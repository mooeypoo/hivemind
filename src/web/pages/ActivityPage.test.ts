// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { AdminActivityDto } from '../../server/http/contracts.ts';
import { createAppRouter } from '../router.ts';
import { navigation } from '../services/api.ts';
import { session } from '../state/session.ts';
import { stubApi } from '../testing/fixtures.ts';
import ActivityPage from './ActivityPage.vue';

const list = { id: 'list-1', title: 'Weekend favourites', slug: 'weekend' };
const other = { id: 'list-2', title: 'Hidden draft', slug: 'draft' };
const event: AdminActivityDto['events'][number] = {
  id: 'event-1',
  action: 'settings-edited',
  at: new Date().toISOString(),
  adminName: 'Alex',
  entryTitle: null,
  changes: [{ field: 'maxNominationsPerMember', before: '3', after: 'null' }],
  list,
};
const data: AdminActivityDto = {
  lists: [list, other],
  events: [event],
  nextCursor: 'older-cursor',
};
const mountPage = async (path = '/admin/activity') => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/activity', name: 'activity', component: ActivityPage },
      { path: '/admin/lists/:slug', name: 'edit-list', component: { render: () => null } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(ActivityPage, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('all lists load immediately with readable details and links to list management', async () => {
  const calls = stubApi({ 'GET /api/admin/activity': () => Response.json(data) });
  const { wrapper } = await mountPage();
  expect(calls[0]?.url).toBe('/api/admin/activity');
  expect(wrapper.get('#activity-list').element).toHaveProperty('value', '');
  expect(wrapper.text()).toContain('Today');
  expect(wrapper.text()).toContain('Alex');
  expect(wrapper.text()).toContain('local time zone');
  expect(wrapper.get('.activity__list a').attributes('href')).toBe('/admin/lists/weekend');
  expect(wrapper.get('details.activity__details').attributes('open')).toBeUndefined();
  await wrapper.get('details.activity__details summary').trigger('click');
  expect(wrapper.text()).toContain('3 → Unlimited');
  wrapper.unmount();
});

test('filtering and browser Back keep the selected list in the URL and reset pagination', async () => {
  const calls = stubApi({
    'GET /api/admin/activity': (call) => {
      const query = new URL(call.url, 'https://example.test').searchParams;
      return Response.json({
        ...data,
        events: query.has('list') ? [{ ...event, list: other }] : [event],
      });
    },
  });
  const { wrapper, router } = await mountPage();
  await wrapper.get('#activity-list').setValue('list-2');
  await flushPromises();
  expect(router.currentRoute.value.query.list).toBe('list-2');
  expect(calls.at(-1)?.url).toBe('/api/admin/activity?list=list-2');
  expect(wrapper.get('.activity__list').text()).toBe('Hidden draft');
  router.back();
  await flushPromises();
  expect(wrapper.get('#activity-list').element).toHaveProperty('value', '');
  expect(wrapper.get('.activity__list').text()).toBe('Weekend favourites');
  wrapper.unmount();
});

test('a direct list link accepts its slug and an unknown list is an error, not an empty history', async () => {
  stubApi({ 'GET /api/admin/activity': () => Response.json(data) });
  const { wrapper } = await mountPage('/admin/activity?list=weekend');
  expect(wrapper.get('#activity-list').element).toHaveProperty('value', 'list-1');
  wrapper.unmount();
  stubApi({
    'GET /api/admin/activity': () =>
      Response.json(
        { error: { code: 'lists.not-found', message: 'That list does not exist.' } },
        { status: 404 },
      ),
  });
  const missing = await mountPage('/admin/activity?list=missing');
  expect(missing.wrapper.get('[role=alert]').text()).toContain('That list does not exist');
  expect(missing.wrapper.text()).not.toContain('No activity recorded');
  expect(missing.wrapper.find('nav[aria-label="Activity pages"]').exists()).toBe(false);
  missing.wrapper.unmount();
});

test('older and newer pages use cursors and refresh returns to the newest page', async () => {
  const calls = stubApi({
    'GET /api/admin/activity': (call) =>
      Response.json(
        call.url.includes('cursor=')
          ? { ...data, events: [{ ...event, adminName: null }], nextCursor: null }
          : data,
      ),
  });
  const { wrapper } = await mountPage();
  const button = (name: string) => wrapper.findAll('button').find((b) => b.text() === name);
  await button('Older activity')?.trigger('click');
  await flushPromises();
  expect(calls.at(-1)?.url).toBe('/api/admin/activity?cursor=older-cursor');
  expect(wrapper.text()).toContain('Admin identity removed');
  expect(wrapper.text()).toContain('Page 2');
  expect(document.title).toContain('page 2');
  await button('Newer activity')?.trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('Alex');
  expect(wrapper.text()).not.toContain('Page 2');
  await button('Older activity')?.trigger('click');
  await flushPromises();
  await button('Refresh activity')?.trigger('click');
  await flushPromises();
  expect(calls.at(-1)?.url).toBe('/api/admin/activity');
  expect(wrapper.text()).toContain('Page 1');
  wrapper.unmount();
});

test('empty histories are distinct from failures and refresh retries visibly', async () => {
  let failed = true;
  stubApi({
    'GET /api/admin/activity': () =>
      failed
        ? Response.json(
            { error: { code: 'http.unavailable', message: 'Activity unavailable.' } },
            { status: 503 },
          )
        : Response.json({ ...data, events: [], nextCursor: null }),
  });
  const { wrapper } = await mountPage('/admin/activity?list=list-1');
  expect(wrapper.get('[role=alert]').text()).toContain('Activity unavailable');
  expect(wrapper.text()).not.toContain('No activity recorded');
  failed = false;
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toBe('');
  expect(wrapper.text()).toContain('No activity recorded for this list yet');
  wrapper.unmount();
});

test('a late response cannot replace the newly selected list', async () => {
  let finish: (response: Response) => void = () => {
    throw new Error('No pending request');
  };
  vi.stubGlobal('fetch', (url: string) =>
    url.includes('list=list-2')
      ? Promise.resolve(Response.json({ ...data, events: [{ ...event, list: other }] }))
      : new Promise<Response>((resolve) => {
          finish = resolve;
        }),
  );
  const { wrapper, router } = await mountPage();
  expect(wrapper.text()).toContain('Loading activity');
  await router.push('/admin/activity?list=list-2');
  await flushPromises();
  finish(Response.json(data));
  await flushPromises();
  expect(wrapper.get('.activity__list').text()).toBe('Hidden draft');
  expect(wrapper.text()).not.toContain('Loading activity');
  wrapper.unmount();
});

test('the app route rejects non-admins and sends signed-out visitors to sign-in', async () => {
  session.loaded = true;
  session.me = { id: '1', displayName: 'Member', avatarUrl: '/favicon.svg', isAdmin: false };
  stubApi({ 'GET /api/me': () => Response.json(session.me) });
  const router = createAppRouter(createMemoryHistory());
  await router.push('/admin/activity');
  expect(router.currentRoute.value.name).toBe('lists');
  session.me = null;
  const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
  await router.push('/admin/activity?list=list-1');
  expect(assign).toHaveBeenCalledWith(
    '/api/auth/login?returnTo=%2Fadmin%2Factivity%3Flist%3Dlist-1',
  );
});
