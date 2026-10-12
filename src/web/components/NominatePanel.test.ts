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
  overview: 'A blade runner must pursue replicants.',
  director: 'Ridley Scott',
  cast: ['Harrison Ford', 'Rutger Hauer'],
};
const bladeRunnerSearchResult = {
  source: 'tmdb-movie',
  externalId: '78',
  title: 'Blade Runner',
  subtitle: '1982',
  imageUrl: null,
  overview: 'A blade runner must pursue replicants.',
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
  test('searches, reviews a movie result, then nominates after confirmation', async () => {
    const calls = stubApi({
      'GET /api/lists/list-1/search': () => Response.json({ items: [bladeRunnerSearchResult] }),
      'GET /api/lists/list-1/item': () => Response.json(bladeRunner),
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
    expect(panel.text()).toContain('A blade runner must pursue replicants.');

    await panel.get('.result button').trigger('click');
    await flushPromises();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe('/api/lists/list-1/item?externalId=78');
    expect(panel.get('dialog').text()).toContain('A blade runner must pursue replicants.');
    expect(panel.get('dialog').text()).toContain('Ridley Scott');
    expect(panel.get('dialog').text()).toContain('Harrison Ford, Rutger Hauer');

    await panel.get('dialog .button--primary').trigger('click');
    await flushPromises();
    expect(calls[2]).toMatchObject({ method: 'POST', body: { externalId: '78' } });
    expect(panel.emitted('nominated')).toHaveLength(1);
    expect((panel.get('input[type=search]').element as HTMLInputElement).value).toBe('');
    expect(panel.find('.results').exists()).toBe(false);
    expect(panel.get('[role=status]').text()).toContain('Nominated Blade Runner');
    expect(panel.find('.just-nominated').exists()).toBe(true);
  });

  test('offers rating immediately on the just nominated card', async () => {
    stubApi({
      'POST /api/lists/list-1/entries': () =>
        Response.json(
          {
            id: 'freeform.inception',
            item: {
              source: 'freeform',
              externalId: 'inception',
              title: 'Inception',
              subtitle: null,
              imageUrl: null,
            },
            nominatedBy: 'ada',
            isMine: true,
            nominatedAt: '',
          },
          { status: 201 },
        ),
    });
    const panel = mount(NominatePanel, {
      props: {
        list: openTmdbList({ itemSource: { kind: 'freeform' } }),
        scoreState: () => ({ value: null, saving: false, error: null }),
      },
    });

    await panel.get('input#nominate-title').setValue('Inception');
    await panel.get('form').trigger('submit');
    await flushPromises();

    expect(panel.find('.just-nominated').exists()).toBe(true);
    expect(panel.find('.just-nominated__rating').exists()).toBe(true);
    const radio = panel.get('.just-nominated__rating input[type=radio][value="8"]');
    await radio.setValue();
    expect(panel.emitted('rate')).toEqual([['freeform.inception', 8]]);
  });

  test('canceling a reviewed movie does not nominate it', async () => {
    const calls = stubApi({
      'GET /api/lists/list-1/search': () => Response.json({ items: [bladeRunnerSearchResult] }),
      'GET /api/lists/list-1/item': () => Response.json(bladeRunner),
    });
    const panel = mount(NominatePanel, { props: { list: openTmdbList() } });

    await panel.get('input[type=search]').setValue('blade');
    vi.advanceTimersByTime(300);
    await flushPromises();
    await panel.get('.result button').trigger('click');
    await panel.get('dialog .button:not(.button--primary)').trigger('click');

    expect(calls).toHaveLength(2);
    expect(panel.find('dialog[open]').exists()).toBe(false);
  });

  test('announces when the catalog search is still loading', async () => {
    let finishSearch: ((response: Response) => void) | undefined;
    stubApi({
      'GET /api/lists/list-1/search': () =>
        new Promise<Response>((resolve) => {
          finishSearch = resolve;
        }) as unknown as Response,
    });
    const panel = mount(NominatePanel, { props: { list: openTmdbList() } });

    await panel.get('input[type=search]').setValue('blade');
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(panel.get('[role=status]').text()).toContain('Searching the catalog');

    finishSearch?.(Response.json({ items: [bladeRunner] }));
    await flushPromises();
    expect(panel.text()).toContain('Blade Runner');
    expect(panel.find('[role=status]').exists()).toBe(false);
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
