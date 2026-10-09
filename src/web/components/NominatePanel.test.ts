// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import NominatePanel from './NominatePanel.vue';

const bladeRunner = {
  source: 'tmdb-movie',
  externalId: '78',
  title: 'Blade Runner',
  subtitle: '1982',
  imageUrl: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('NominatePanel', () => {
  test('searches the list as you type, then nominates a result', async () => {
    const calls = stubApi({
      'GET /api/lists/list-1/search': () => Response.json({ items: [bladeRunner] }),
      'POST /api/lists/list-1/entries': () =>
        Response.json(
          {
            id: 'tmdb-movie.78',
            item: bladeRunner,
            nominatedBy: 'ada',
            isMine: true,
            nominatedAt: '',
          },
          { status: 201 },
        ),
    });
    const panel = mount(NominatePanel, { props: { list: openTmdbList() } });

    await panel.get('input[type=search]').setValue('blade');
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(calls[0]?.url).toBe('/api/lists/list-1/search?q=blade');
    expect(panel.text()).toContain('Blade Runner');

    await panel.get('.result button').trigger('click');
    await flushPromises();
    expect(calls[1]).toMatchObject({ method: 'POST', body: { externalId: '78' } });
    expect(panel.emitted('nominated')).toHaveLength(1);
  });

  test('marks results that are already in the list', async () => {
    stubApi({ 'GET /api/lists/list-1/search': () => Response.json({ items: [bladeRunner] }) });
    const list = openTmdbList({
      entries: [
        {
          id: 'tmdb-movie.78',
          item: bladeRunner,
          nominatedBy: null,
          isMine: false,
          nominatedAt: '',
        },
      ],
    });
    const panel = mount(NominatePanel, { props: { list } });
    await panel.get('input[type=search]').setValue('blade');
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(panel.find('.result button').exists()).toBe(false);
    expect(panel.text()).toContain('Already in the list');
  });

  test('a free-text list takes a typed title', async () => {
    const calls = stubApi({
      'POST /api/lists/list-1/entries': () =>
        Response.json(
          {
            id: 'x',
            item: { ...bladeRunner, title: 'Root' },
            nominatedBy: null,
            isMine: true,
            nominatedAt: '',
          },
          { status: 201 },
        ),
    });
    const panel = mount(NominatePanel, {
      props: { list: openTmdbList({ itemSource: { kind: 'freeform' } }) },
    });
    await panel.get('#nominate-title').setValue('Root');
    await panel.get('form').trigger('submit');
    await flushPromises();
    expect(calls[0]?.body).toEqual({ title: 'Root' });
    expect((panel.get('#nominate-title').element as HTMLInputElement).value).toBe('');
  });

  test('shows the server error, e.g. a duplicate', async () => {
    stubApi({
      'POST /api/lists/list-1/entries': () =>
        Response.json(
          {
            error: {
              code: 'lists.already-nominated',
              message: 'That item is already in this list.',
            },
          },
          { status: 409 },
        ),
    });
    const panel = mount(NominatePanel, {
      props: { list: openTmdbList({ itemSource: { kind: 'freeform' } }) },
    });
    await panel.get('#nominate-title').setValue('Root');
    await panel.get('form').trigger('submit');
    await flushPromises();
    expect(panel.get('[role=alert]').text()).toContain('already in this list');
  });

  test('with unlimited nominations, says so instead of counting down', () => {
    const panel = mount(NominatePanel, {
      props: {
        list: openTmdbList({
          maxNominationsPerMember: null,
          viewer: { canParticipate: true, canNominate: true, nominationsUsed: 7 },
        }),
      },
    });
    expect(panel.text()).toContain('Nominate as many as you like.');
    expect(panel.text()).toContain('You’ve nominated 7 so far.');
    expect(panel.find('input[type=search]').exists()).toBe(true);
  });

  test.each([
    [
      'the cap is reached',
      { viewer: { canParticipate: true, canNominate: false, nominationsUsed: 3 } },
      'You’ve used all 3 of your nominations.',
    ],
    ['the list is not open yet', { lifecycle: 'scheduled' as const }, 'Nominations open'],
    [
      'a role is required',
      { viewer: { canParticipate: false, canNominate: false, nominationsUsed: 0 } },
      'open only to members with a particular role',
    ],
    [
      'nominations have closed',
      { viewer: { canParticipate: true, canNominate: false, nominationsUsed: 1 } },
      'Nominations are closed',
    ],
  ])('explains why you cannot nominate when %s', (_, overrides, text) => {
    const panel = mount(NominatePanel, { props: { list: openTmdbList(overrides) } });
    expect(panel.text()).toContain(text);
    expect(panel.find('input').exists()).toBe(false);
  });
});
