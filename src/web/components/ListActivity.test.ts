// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { stubApi } from '../testing/fixtures.ts';
import ListActivity from './ListActivity.vue';

afterEach(() => vi.unstubAllGlobals());
test('activity loads only on request, explains retention, and renders named and anonymised events', async () => {
  const calls = stubApi({
    'GET /api/lists/list-1/activity': () =>
      Response.json({
        events: [
          {
            id: '2',
            action: 'settings-edited',
            at: '2026-01-02T12:00:00Z',
            adminName: 'Alex',
            entryTitle: null,
            changes: [
              { field: 'maxNominationsPerMember', before: '3', after: 'null' },
              { field: 'description', before: null, after: null },
            ],
          },
          {
            id: '1',
            action: 'created',
            at: '2025-01-01T12:00:00Z',
            adminName: null,
            entryTitle: null,
            changes: [],
          },
        ],
      }),
  });
  const wrapper = mount(ListActivity, { props: { listId: 'list-1', settingsVersion: 0 } });
  expect(calls).toHaveLength(0);
  expect(wrapper.text()).toContain('Admin only');
  expect(wrapper.text()).toContain('one year');
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.text()).toContain('Alex');
  expect(wrapper.text()).toContain('Admin identity removed');
  expect(wrapper.text()).toContain('3 → Unlimited');
  expect(wrapper.text()).toContain('Description changed');
  expect(wrapper.text()).not.toContain('memberId');
  await wrapper.setProps({ settingsVersion: 1 });
  await flushPromises();
  expect(calls).toHaveLength(2);
  wrapper.unmount();
});

test('failures are visible and refresh can retry; older events are progressively revealed', async () => {
  let failed = true;
  stubApi({
    'GET /api/lists/list-1/activity': () =>
      failed
        ? Response.json(
            { error: { code: 'http.unavailable', message: 'Activity could not be loaded.' } },
            { status: 503 },
          )
        : Response.json({
            events: Array.from({ length: 21 }, (_, i) => ({
              id: String(i),
              action: 'created',
              at: '2026-01-01T12:00:00Z',
              adminName: 'Alex',
              entryTitle: null,
              changes: [],
            })),
          }),
  });
  const wrapper = mount(ListActivity, { props: { listId: 'list-1', settingsVersion: 0 } });
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('Activity could not be loaded');
  expect(wrapper.text()).not.toContain('No activity recorded');
  failed = false;
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Refresh activity')
    ?.trigger('click');
  await flushPromises();
  expect(wrapper.findAll('.activity__event')).toHaveLength(20);
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Show older activity')
    ?.trigger('click');
  expect(wrapper.findAll('.activity__event')).toHaveLength(21);
  wrapper.unmount();
});
