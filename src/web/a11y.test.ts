// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import type { ListDetailDto, SiteDto } from '../server/http/contracts.ts';
import App from './App.vue';
import { session } from './state/session.ts';
import { site } from './state/site.ts';
import { expectAccessible } from './testing/axe.ts';
import { openTmdbList, stubApi } from './testing/fixtures.ts';

const entry = (id: string, title: string, imageUrl: string | null = null) => ({
  id,
  item: { source: 'freeform', externalId: id, title, subtitle: '1982', imageUrl },
  nominatedBy: 'ada',
  isMine: id === 'a',
  nominatedAt: '2026-01-01T00:00:00.000Z',
  withdrawalToken: id === 'a' ? 'claim-a' : null,
  deletionToken: `entry-${id}`,
});
const list = (overrides: Partial<ListDetailDto> = {}): ListDetailDto =>
  openTmdbList({
    entries: [
      entry('a', 'Blade Runner', 'https://image.tmdb.org/t/p/w342/x.jpg'),
      entry('b', 'Alien'),
    ],
    ...overrides,
  });
const siteInfo: SiteDto = {
  community: {
    name: 'Film Club',
    iconUrl: 'https://cdn.discordapp.com/icons/1/a.png',
    inviteUrl: 'https://discord.gg/x',
  },
  offersMovieData: true,
  offersTvData: true,
  offersGameData: true,
  demo: false,
  backups: true,
};
const me = {
  id: '1',
  displayName: 'Ada',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
  isAdmin: true,
};
const rankingRows = [
  {
    rank: 1,
    entryId: 'a',
    item: entry('a', 'Blade Runner').item,
    score: 8.2,
    votes: 4,
    provisional: false,
    votesNeeded: 0,
  },
  {
    rank: null,
    entryId: 'b',
    item: entry('b', 'Alien').item,
    score: null,
    votes: 0,
    provisional: true,
    votesNeeded: 3,
  },
];

/** Mounts the whole app (header, page, footer) at `path`, as a signed-in Admin or signed out. */
const renderAt = async (
  path: string,
  signedIn: boolean,
  demo = false,
  publicScores = false,
  unlimitedCap = false,
  mediaSource: 'tvdb-series' | 'igdb-game' | null = null,
  unusedList = false,
  deletingList = false,
  entryState: 'deleting' | 'withdrawn' | 'set-aside' | null = null,
) => {
  session.loaded = true;
  session.me = signedIn ? me : null;
  site.info = { ...siteInfo, demo };
  stubApi({
    'GET /api/site': () => Response.json({ ...siteInfo, demo }),
    'POST /api/auth/demo': () => new Response(null, { status: 204 }),
    'GET /api/me': () => (signedIn ? Response.json(me) : Response.json({}, { status: 401 })),
    'GET /api/lists': () =>
      Response.json({ lists: [list(), list({ id: 'l2', slug: 'draft', lifecycle: 'draft' })] }),
    'GET /api/lists/best-sci-fi': () =>
      Response.json(
        list({
          ...(mediaSource !== null
            ? {
                itemSource: { kind: mediaSource },
                entries: [
                  {
                    ...entry('a', 'A TV Show'),
                    item: {
                      source: mediaSource,
                      externalId: '123',
                      title: 'A TV Show',
                      subtitle: '2020',
                      imageUrl: null,
                      overview: 'A series synopsis.',
                      creator: 'A Creator',
                      cast: ['An Actor'],
                      ...(mediaSource === 'igdb-game'
                        ? { developer: 'A Studio', publisher: 'A Publisher' }
                        : {}),
                    },
                  },
                ],
              }
            : {}),
          scoreVisibility: publicScores ? 'public' : 'private',
          maxNominationsPerMember: unlimitedCap ? null : 3,
          ...(unusedList ? { entries: [], itemSourceEditable: true } : {}),
          ...(deletingList ? { deleting: true, itemSourceEditable: false } : {}),
          ...(entryState === 'deleting'
            ? {
                participationPaused: true,
                entryDeletion: { entryId: 'a', token: 'entry-a', title: 'Blade Runner' },
                viewer: { canParticipate: false, canNominate: false, nominationsUsed: 1 },
              }
            : {}),
          ...(entryState === 'withdrawn'
            ? {
                entries: [],
                withdrawnEntries: [entry('a', 'Blade Runner')],
              }
            : {}),
          ...(entryState === 'set-aside'
            ? {
                entries: [
                  entry('a', 'Blade Runner'),
                  { ...entry('b', 'Alien'), setAsideReason: 'Outside this list’s criteria' },
                ],
              }
            : {}),
        }),
      ),
    'GET /api/lists/closed': () => Response.json(list({ lifecycle: 'closed', slug: 'closed' })),
    'GET /api/lists/draft': () =>
      Response.json(list({ lifecycle: 'draft', slug: 'draft', schedule: null })),
    'GET /api/lists/best-sci-fi/ballot': () =>
      Response.json({ listId: 'list-1', scores: { a: 8 } }),
    'GET /api/lists/best-sci-fi/scores': () =>
      Response.json(publicScores ? { visible: true, entries: { a: [] } } : { visible: false }),
    'GET /api/lists/closed/ballot': () => Response.json({ listId: 'list-1', scores: { a: 8 } }),
    'GET /api/lists/closed/scores': () => Response.json({ visible: false }),
    'GET /api/lists/best-sci-fi/leaderboard': () =>
      Response.json({
        hidden: false,
        computedAt: new Date().toISOString(),
        minVotes: 3,
        rows: rankingRows,
        ...(entryState === 'set-aside'
          ? {
              groups: { main: rankingRows.slice(0, 1), setAside: rankingRows.slice(1) },
            }
          : {}),
      }),
    'GET /api/lists/closed/leaderboard': () =>
      Response.json({ hidden: true, revealsAt: '2026-01-10T00:00:00.000Z' }),
    'GET /api/catalog/sources': () =>
      Response.json({ sources: ['tmdb-movie', 'tvdb-series', 'igdb-game', 'freeform', 'preset'] }),
    'GET /api/roles': () =>
      Response.json({
        labels: [{ roleId: '900000000000000077', name: 'Film Club' }],
        version: 'v1',
      }),
    'GET /api/lists/list-1/activity': () =>
      Response.json({
        events: [
          {
            id: 'a1',
            action: 'settings-edited',
            at: '2026-01-02T12:00:00Z',
            adminName: 'Alex',
            entryTitle: null,
            changes: [{ field: 'maxNominationsPerMember', before: '3', after: 'null' }],
          },
          {
            id: 'a2',
            action: 'entry-set-aside',
            at: '2025-01-01T12:00:00Z',
            adminName: null,
            entryTitle: 'An item',
            changes: [],
          },
        ],
      }),
  });
  const { createAppRouter } = await import('./router.ts');
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: host });
  await flushPromises();
  await flushPromises();
  return wrapper;
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('every page passes automated accessibility checks', () => {
  test('admin activity history is accessible with named and anonymised decisions', async () => {
    const wrapper = await renderAt('/admin/lists/best-sci-fi', true);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Show activity')
      ?.trigger('click');
    await flushPromises();
    expect(wrapper.get('.activity').text()).toContain('Admin identity removed');
    expect(wrapper.get('.activity').text()).toContain('Alex');
    await expectAccessible(document.body);
    wrapper.unmount();
  });
  test('stale editor settings comparison is accessible', async () => {
    sessionStorage.setItem(
      'draft:editor:draft',
      JSON.stringify({
        form: { description: 'My unsaved description' },
        settingsVersion: -1,
        lifecycle: 'draft',
      }),
    );
    try {
      const wrapper = await renderAt('/admin/lists/draft', true);
      expect(wrapper.get('#settings-conflict-heading').text()).toBe('Compare before continuing');
      expect(wrapper.get('.settings-conflict').text()).toContain('My unsaved description');
      await expectAccessible(document.body);
      wrapper.unmount();
    } finally {
      sessionStorage.removeItem('draft:editor:draft');
    }
  });
  test.each([false, true])('publishing review is accessible (named scores: %s)', async (named) => {
    const wrapper = await renderAt('/admin/lists/draft', true);
    if (named) await wrapper.get('input[name=score-visibility][value=public]').setValue(true);
    await wrapper.get('[data-review-publish]').trigger('click');
    await flushPromises();
    expect(document.querySelector('dialog[open] #publish-locks')).not.toBeNull();
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test.each(['/lists/best-sci-fi?tab=standings', '/lists/best-sci-fi/results'])(
    'separate and combined standings at %s are accessible',
    async (path) => {
      const wrapper = await renderAt(
        path,
        true,
        false,
        false,
        false,
        null,
        false,
        false,
        'set-aside',
      );
      expect(wrapper.get('.set-aside-ranking .set-aside-notice').text()).toContain('Set aside');
      expect(wrapper.find('.set-aside-notice__reason').exists()).toBe(false);
      await wrapper.get('.set-aside-ranking .set-aside-notice__why').trigger('click');
      await flushPromises();
      expect(document.querySelector('dialog[open]')?.textContent).toContain(
        'Outside this list’s criteria',
      );
      await expectAccessible(document.body);
      await wrapper.get('dialog[open] .dialog__actions button:last-child').trigger('click');
      await expectAccessible(document.body);
      expect(wrapper.get<HTMLDetailsElement>('.ranking-options').element.open).toBe(false);
      wrapper.get<HTMLDetailsElement>('.ranking-options').element.open = true;
      await wrapper.get('.ranking-options').trigger('toggle');
      await expectAccessible(document.body);
      await wrapper.get('input[value=combined]').setValue(true);
      await flushPromises();
      expect(wrapper.find('.set-aside-ranking').exists()).toBe(false);
      await wrapper.get('.set-aside-notice__why').trigger('click');
      await flushPromises();
      expect(document.querySelector('dialog[open]')?.textContent).toContain(
        'Outside this list’s criteria',
      );
      await expectAccessible(document.body);
      wrapper.unmount();
    },
  );

  test.each([
    '/lists/best-sci-fi',
    '/lists/closed',
    '/lists/best-sci-fi?tab=standings',
    '/lists/best-sci-fi/results',
  ])('the set-aside editor at %s is accessible', async (path) => {
    const wrapper = await renderAt(path, true);
    await wrapper
      .get(
        path === '/lists/best-sci-fi' || path === '/lists/closed'
          ? '.entry__art'
          : '.standing__title-button',
      )
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Set aside...')
      ?.trigger('click');
    await flushPromises();
    expect(document.querySelector('dialog[open] textarea')).not.toBeNull();
    if (path === '/lists/closed')
      expect(document.querySelector('dialog[open]')?.textContent).toContain(
        'changes the final standings',
      );
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test.each([false, true])(
    'the permanent deletion dialog is accessible (pending: %s)',
    async (pending) => {
      const wrapper = await renderAt(
        '/admin/lists/best-sci-fi',
        true,
        false,
        false,
        false,
        null,
        false,
        pending,
      );
      await wrapper
        .findAll('button')
        .find((button) => button.text() === (pending ? 'Retry deletion…' : 'Delete list…'))
        ?.trigger('click');
      await flushPromises();
      expect(document.querySelector('dialog[open]')).not.toBeNull();
      await expectAccessible(document.body);
      wrapper.unmount();
    },
  );

  test('an unused published list with editable source and preset controls is accessible', async () => {
    const wrapper = await renderAt(
      '/admin/lists/best-sci-fi',
      true,
      false,
      false,
      false,
      null,
      true,
    );
    await wrapper.get('input[value=preset]').setValue(true);
    await flushPromises();
    expect(wrapper.get('input[value=seeded]').attributes('disabled')).toBeDefined();
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test('retained withdrawal management and deletion pass accessibility checks', async () => {
    const wrapper = await renderAt(
      '/lists/best-sci-fi',
      true,
      false,
      false,
      false,
      null,
      false,
      false,
      'withdrawn',
    );
    await wrapper
      .get('button[aria-label="Permanently delete withdrawn Blade Runner"]')
      .trigger('click');
    await flushPromises();
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test.each(['/lists/best-sci-fi', '/lists/best-sci-fi/results'])(
    'TV series state at %s is accessible',
    async (path) => {
      const wrapper = await renderAt(path, true, false, false, false, 'tvdb-series');
      expect(wrapper.text()).toContain('TheTVDB');
      await expectAccessible(document.body);
      wrapper.unmount();
    },
  );

  test.each(['/lists/best-sci-fi', '/lists/best-sci-fi/results'])(
    'game state at %s is accessible',
    async (path) => {
      const wrapper = await renderAt(path, true, false, false, false, 'igdb-game');
      expect(wrapper.text()).toContain('Game data and artwork from');
      await expectAccessible(document.body);
      if (path === '/lists/best-sci-fi') {
        await wrapper.get('.entry__art').trigger('click');
        await flushPromises();
        expect(document.body.textContent).toContain('A Studio');
        await expectAccessible(document.body);
      }
      wrapper.unmount();
    },
  );

  test.each([
    ['the welcome page, signed out', '/', false],
    ['a sign-in failure message', '/?login=identity.not-a-member', false],
    ['an unexpected sign-in failure', '/?login=http.internal', false],
    ['the lists index', '/', true],
    ['an open list with rating and leaderboard', '/lists/best-sci-fi', true],
    ['an open list with public scores', '/lists/best-sci-fi', true, false, true],
    ['a closed list with hidden results', '/lists/closed', true],
    ['the results page', '/lists/best-sci-fi/results', true],
    ['the results page while results are hidden', '/lists/closed/results', true],
    ['the new-list editor', '/admin/lists/new', true],
    ['the editor of a published list', '/admin/lists/best-sci-fi', true],
    ['the editor of a draft (schedule choices)', '/admin/lists/draft', true],
    ['the roles page', '/admin/roles', true],
    ['the backups page', '/admin/backups', true],
    ['the privacy page', '/privacy', false],
    ['the About page', '/about', false],
    ['not found', '/nope', false],
    ['the welcome page in demo mode', '/', false, true],
    ['a list page in demo mode', '/lists/best-sci-fi', true, true],
  ])('%s', async (_, path, signedIn, demo = false, publicScores = false) => {
    const wrapper = await renderAt(path, signedIn, demo, publicScores);
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test.each(['tmdb-movie', 'tvdb-series', 'igdb-game'])(
    'the %s nomination review dialog is accessible',
    async (source) => {
      const wrapper = await renderAt('/lists/best-sci-fi', true);
      stubApi({
        'GET /api/lists/list-1/search': () =>
          Response.json({
            items: [
              {
                source,
                externalId: '78',
                title: 'Blade Runner',
                subtitle: '1982',
                imageUrl: null,
                overview: 'A blade runner must pursue replicants.',
              },
            ],
          }),
      });
      vi.useFakeTimers();

      await wrapper.get('#list-tab-nominate').trigger('click');
      await wrapper.get('input[type=search]').setValue('blade');
      vi.advanceTimersByTime(300);
      await flushPromises();
      await wrapper.get('.result button').trigger('click');
      await flushPromises();
      vi.useRealTimers();
      await expectAccessible(document.body);

      wrapper.unmount();
    },
  );
});

describe('demo mode', () => {
  test('offers pretend sign-in and a banner only when the site is in demo mode', async () => {
    let wrapper = await renderAt('/', false, false);
    expect(document.body.textContent).not.toContain('Try as Demo');
    expect(document.querySelector('.demo-banner')).toBeNull();
    wrapper.unmount();

    wrapper = await renderAt('/', false, true);
    expect(document.querySelector('.demo-banner')?.textContent).toContain('Demo mode');
    const buttons = [...document.querySelectorAll('.demo-sign-in button')].map((b) =>
      b.textContent.trim(),
    );
    expect(buttons).toEqual(['Try as Demo Admin', 'Try as Demo Member A', 'Try as Demo Member B']);
    wrapper.unmount();
  });
});

describe('the menu', () => {
  const menuDialog = () =>
    [...document.querySelectorAll('dialog')].find((dialog) => dialog.querySelector('nav.menu'));
  const menuLinks = () =>
    [...(menuDialog()?.querySelectorAll('.menu__item') ?? [])].map((item) =>
      item.textContent.trim(),
    );

  test('is one menu: site links, Admin tools, your data, appearance and sign out', async () => {
    const wrapper = await renderAt('/', true);
    expect(document.querySelectorAll('details')).toHaveLength(0);
    expect(menuLinks()).toEqual([
      'Lists',
      'About',
      'New list',
      'Roles',
      'Backups',
      'Admin guide and FAQ (opens in a new tab)',
      'Privacy',
      'Download my data',
      'Delete my data',
    ]);
    expect(menuDialog()?.textContent).toContain('Appearance');
    expect(menuDialog()?.textContent).toContain('Sign out');
    const guide = menuDialog()?.querySelector('a[target="_blank"]');
    expect(guide?.textContent).toContain('Admin guide and FAQ');
    expect(guide?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(guide?.querySelector('.external-link-icon')).not.toBeNull();
    wrapper.unmount();
  });

  test('signed out, it offers the site links, privacy and sign-in', async () => {
    const wrapper = await renderAt('/', false);
    expect(menuLinks()).toEqual(['Lists', 'About', 'Privacy']);
    expect(menuDialog()?.textContent).toContain('Sign in with Discord');
    wrapper.unmount();
  });

  test('opens from the header and closes after following a link', async () => {
    const wrapper = await renderAt('/', false);
    await wrapper.get('.menu-trigger').trigger('click');
    expect(menuDialog()?.open).toBe(true);
    expect(wrapper.get('.menu-trigger').attributes('aria-expanded')).toBe('true');
    await wrapper.get('nav.menu a[href="/about"]').trigger('click');
    await flushPromises();
    expect(menuDialog()?.open).toBe(false);
    expect(document.querySelector('main h1')?.textContent).toContain('About');
    wrapper.unmount();
  });

  test('the appearance switch applies the chosen theme', async () => {
    const wrapper = await renderAt('/', true);
    await wrapper.get('.segmented input[value="dark"]').trigger('change');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await wrapper.get('.segmented input[value="system"]').trigger('change');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    wrapper.unmount();
  });
});

describe('list page dialogs', () => {
  test('standings thumbnails and their details dialog pass accessibility checks', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    await wrapper.get('#list-tab-standings').trigger('click');
    await flushPromises();
    await expectAccessible(document.body);
    await wrapper.get('.ranking__art').trigger('click');
    await flushPromises();
    expect(wrapper.get('dialog[open]').text()).toContain('Alien');
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test('withdrawal confirmation and its error pass automated accessibility checks', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    await wrapper.get('.entry__art').trigger('click');
    await wrapper.get('dialog[open] .dialog__actions .button--danger').trigger('click');
    await flushPromises();
    await expectAccessible(document.body);
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) =>
      input.endsWith('/entries/withdraw')
        ? Promise.resolve(
            Response.json(
              { error: { code: 'lists.conflict', message: 'Reload and try again.' } },
              { status: 409 },
            ),
          )
        : original(input, init),
    );
    await wrapper.get('dialog[open] .button--danger').trigger('click');
    await flushPromises();
    expect(wrapper.get('dialog[open] [role="alert"]').text()).toContain('Reload and try again.');
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test('entry details pass automated accessibility checks', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    await wrapper.get('.entry__art').trigger('click');
    await flushPromises();
    const details = [...document.querySelectorAll('dialog')].find((d) => d.open);
    expect(details?.textContent).toContain('Blade Runner');
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test('rating one by one passes automated accessibility checks', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    await wrapper.get('.ballot-bar .button--primary').trigger('click');
    await flushPromises();
    const stage = document.querySelector('dialog.dialog--stage');
    expect(stage?.textContent).toContain('Alien');
    await expectAccessible(document.body);
    wrapper.unmount();
  });
});

describe('archiving', () => {
  test.each([
    '/lists/best-sci-fi',
    '/lists/best-sci-fi?tab=standings',
    '/lists/best-sci-fi/results',
  ])('entry deletion confirmation at %s passes accessibility checks', async (path) => {
    const wrapper = await renderAt(path, true);
    await wrapper
      .get(path === '/lists/best-sci-fi' ? '.entry__art' : '.standing__title-button')
      .trigger('click');
    await wrapper.get('button[aria-label="Permanently delete Blade Runner"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('dialog[open]')?.textContent).toContain('all its scores');
    await expectAccessible(document.body);
    wrapper.unmount();
  });

  test.each(['/lists/best-sci-fi', '/lists/best-sci-fi/results'])(
    'pending entry deletion retry at %s passes accessibility checks',
    async (path) => {
      const wrapper = await renderAt(
        path,
        true,
        false,
        false,
        false,
        null,
        false,
        false,
        'deleting',
      );
      await wrapper.get('.notice button').trigger('click');
      await flushPromises();
      await expectAccessible(document.body);
      wrapper.unmount();
    },
  );
  test('explains plainly that it is permanent, and asks for the address to be typed', async () => {
    const wrapper = await renderAt('/admin/lists/best-sci-fi', true);
    const dialogs = [...document.querySelectorAll('dialog')].map((d) => d.textContent);
    const archive = dialogs.find((text) => text.includes('un-archived'));
    expect(archive).toContain('This can’t be undone.');
    expect(archive).toContain('can never be edited, reopened or un-archived');
    expect(archive).toContain('Type best-sci-fi to confirm');
    wrapper.unmount();
  });
});

describe('score visibility editor', () => {
  test('drafts offer the choice and published lists lock it', async () => {
    const draft = await renderAt('/admin/lists/new', true);
    const privateChoice = document.querySelector<HTMLInputElement>(
      'input[name="score-visibility"][value="private"]',
    );
    const publicChoice = document.querySelector<HTMLInputElement>(
      'input[name="score-visibility"][value="public"]',
    );
    expect(privateChoice?.checked).toBe(true);
    expect(publicChoice?.disabled).toBe(false);
    publicChoice?.click();
    expect(publicChoice?.checked).toBe(true);
    draft.unmount();

    const published = await renderAt('/admin/lists/best-sci-fi', true);
    const section = (legend: string) =>
      [...document.querySelectorAll<HTMLFieldSetElement>('form > fieldset')].find(
        (fieldset) => fieldset.querySelector('legend')?.textContent === legend,
      );
    expect(section('Rating')?.disabled).toBe(true);
    expect(section('Scores')?.disabled).toBe(true);
    expect(section('Nominations')?.disabled).toBe(false);
    const unlimited = document.querySelector<HTMLInputElement>('#unlimited');
    expect(unlimited?.disabled).toBe(false);
    unlimited?.click();
    expect(unlimited?.checked).toBe(true);
    expect(document.querySelector('main')?.textContent).toContain(
      'You can remove this limit to allow unlimited nominations.',
    );
    published.unmount();

    const alreadyUnlimited = await renderAt('/admin/lists/best-sci-fi', true, false, false, true);
    expect(document.querySelector<HTMLInputElement>('#unlimited')?.disabled).toBe(true);
    alreadyUnlimited.unmount();
  });

  test('a published public list confirms the one-way switch to private', async () => {
    const wrapper = await renderAt('/admin/lists/best-sci-fi', true, false, true);
    const button = [...document.querySelectorAll('button')].find(
      (item) => item.innerText.trim() === 'Make scores private',
    );
    expect(button).not.toBeUndefined();
    button?.click();
    await flushPromises();
    const dialog = [...document.querySelectorAll('dialog')].find(
      (item) =>
        document.getElementById(item.getAttribute('aria-labelledby') ?? '')?.textContent ===
        'Make scores private?',
    );
    expect(dialog?.textContent).toContain(
      'Members will no longer see who gave what score. This setting can’t be changed back.',
    );
    wrapper.unmount();
  });
});

describe('lists index', () => {
  test('groups lists into open and upcoming, closed and archived', async () => {
    const wrapper = await renderAt('/', true);
    expect([...document.querySelectorAll('.list-group > h2')].map((h) => h.textContent)).toEqual([
      'Open and upcoming',
    ]);
    wrapper.unmount();
  });
});

describe('site-wide content', () => {
  test('the footer names the community and credits, and links the source and privacy page', async () => {
    const wrapper = await renderAt('/privacy', false);
    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Connected to Film Club');
    expect(footer?.textContent).toContain('Made by Moriel Schottlender');
    expect(footer?.querySelector('a[href="https://moriel.tech"]')).not.toBeNull();
    expect(
      footer?.querySelector('a[href="https://github.com/mooeypoo/hivemind"]')?.textContent,
    ).toBe('Source code (opens in a new tab)');
    expect(footer?.textContent).toContain('GPL-3.0-or-later');
    expect(footer?.textContent).toContain('Movie data from TMDB');
    wrapper.unmount();
  });

  test('without movie lists, the footer does not mention TMDB', async () => {
    const wrapper = await renderAt('/privacy', false);
    site.info = {
      community: null,
      offersMovieData: false,
      offersTvData: false,
      offersGameData: false,
      demo: false,
      backups: false,
    };
    await flushPromises();
    expect(document.querySelector('footer')?.textContent).not.toContain('TMDB');
    expect(document.querySelector('footer')?.textContent).toContain(
      'Connected to a Discord community',
    );
    wrapper.unmount();
  });

  test('the welcome page names the community and offers to join it', async () => {
    const wrapper = await renderAt('/', false);
    expect(document.querySelector('.landing')?.textContent).toContain('For members of Film Club');
    expect(document.querySelector('.landing')?.textContent).toContain(
      'Lists are only for members of the Film Club Discord server.',
    );
    expect(document.querySelector('.site-footer')?.textContent).not.toContain('signed-in members');
    expect(
      document
        .querySelector('a[href="https://discord.gg/x"]')
        ?.textContent.replace(/\s+/g, ' ')
        .trim(),
    ).toBe('Join the server (opens in a new tab)');
    wrapper.unmount();
  });

  test('signed in, the footer says lists are for members only', async () => {
    const wrapper = await renderAt('/', true);
    expect(document.querySelector('.site-footer')?.textContent).toContain(
      'Lists here are visible only to its signed-in members.',
    );
    wrapper.unmount();
  });

  test('the privacy page explains storage, cookies, and download and delete', async () => {
    const wrapper = await renderAt('/privacy', false);
    const headings = [...document.querySelectorAll('main h2')].map((h) => h.textContent);
    expect(headings).toEqual([
      'What we store about you',
      'What we never store',
      'Setting entries aside',
      'Admin activity history',
      'Withdrawing a nomination',
      'When an Admin deletes a list',
      'When an Admin deletes an entry',
      'Shared links',
      'Cookies and browser storage',
      'Download my data',
      'Delete my data',
      'Backups',
      'Who owns what',
      'Questions',
    ]);
    expect(document.title).toBe('Privacy · hivemind');
    wrapper.unmount();
  });

  test('the About page explains scores and shows community credits', async () => {
    const wrapper = await renderAt('/about', false);
    expect(document.querySelector('main')?.textContent).toContain(
      'Scores are private unless a list says they are public.',
    );
    expect(document.querySelector('main')?.textContent).toContain('Film Club');
    expect(
      document.querySelector('main')?.querySelector('a[href="https://moriel.tech"]'),
    ).not.toBeNull();
    wrapper.unmount();
  });

  test('each page has its own title', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    expect(document.title).toBe('Best Sci-Fi Movies · hivemind');
    wrapper.unmount();
  });
});
