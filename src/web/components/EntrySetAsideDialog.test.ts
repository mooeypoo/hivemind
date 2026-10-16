// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import { loadDraft } from '../lib/drafts.ts';
import EntrySetAsideDialog from './EntrySetAsideDialog.vue';

const entry = {
  id: 'a',
  item: { source: 'freeform', externalId: 'a', title: 'Root', subtitle: null, imageUrl: null },
  nominatedBy: null,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
  deletionToken: 'incarnation',
};
afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  document.body.innerHTML = '';
});

test('requires a reason, saves the typed request and clears the draft after success', async () => {
  const calls: unknown[] = [];
  stubApi({
    'PUT /api/lists/list-1/entries/set-aside': (call) => {
      calls.push(call.body);
      return Response.json({ ...entry, setAsideReason: 'Outside scope' });
    },
  });
  const wrapper = mount(EntrySetAsideDialog, {
    props: { entry, list: openTmdbList() },
    attachTo: document.body,
  });
  expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined();
  await wrapper.get('textarea').setValue('Outside scope');
  expect(loadDraft('set-aside:list-1:a:incarnation')).toBe('Outside scope');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(calls).toEqual([
    { entryId: 'a', token: 'incarnation', expectedReason: null, reason: 'Outside scope' },
  ]);
  expect(wrapper.emitted('saved')?.[0]?.[0]).toMatchObject({ setAsideReason: 'Outside scope' });
  expect(loadDraft('set-aside:list-1:a:incarnation')).toBeNull();
  wrapper.unmount();
});

test('restores unsaved drafts and keeps them after an API error', async () => {
  stubApi({
    'PUT /api/lists/list-1/entries/set-aside': () =>
      Response.json(
        {
          error: { code: 'lists.conflict', message: 'Someone else changed this entry.' },
        },
        { status: 409 },
      ),
  });
  let wrapper = mount(EntrySetAsideDialog, { props: { entry, list: openTmdbList() } });
  await wrapper.get('textarea').setValue('Unsaved reason');
  wrapper.unmount();
  wrapper = mount(EntrySetAsideDialog, { props: { entry, list: openTmdbList() } });
  expect(wrapper.get('textarea').element.value).toBe('Unsaved reason');
  await wrapper.get('form').trigger('submit');
  await flushPromises();
  expect(wrapper.get('[role=alert]').text()).toContain('Someone else changed');
  expect(wrapper.get('textarea').element.value).toBe('Unsaved reason');
  expect(wrapper.emitted('saved')).toBeUndefined();
  wrapper.unmount();
});

test('restoring sends null with the observed reason and warns about closed-list changes', async () => {
  const calls: unknown[] = [];
  stubApi({
    'PUT /api/lists/list-1/entries/set-aside': (call) => {
      calls.push(call.body);
      return Response.json({ ...entry, setAsideReason: null });
    },
  });
  const wrapper = mount(EntrySetAsideDialog, {
    props: {
      entry: { ...entry, setAsideReason: 'Outside scope' },
      list: openTmdbList({ lifecycle: 'closed' }),
    },
  });
  expect(wrapper.text()).toContain('changes the final standings');
  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Return to main ranking')
    ?.trigger('click');
  await flushPromises();
  expect(calls).toEqual([
    { entryId: 'a', token: 'incarnation', expectedReason: 'Outside scope', reason: null },
  ]);
  wrapper.unmount();
});
