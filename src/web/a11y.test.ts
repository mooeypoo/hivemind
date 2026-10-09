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
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
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
  demo: false,
};
const me = {
  id: '1',
  displayName: 'Ada',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
  isAdmin: true,
};

/** Mounts the whole app (header, page, footer) at `path`, as a signed-in Admin or signed out. */
const renderAt = async (path: string, signedIn: boolean, demo = false) => {
  session.loaded = true;
  session.me = signedIn ? me : null;
  site.info = { ...siteInfo, demo };
  stubApi({
    'GET /api/site': () => Response.json({ ...siteInfo, demo }),
    'POST /api/auth/demo': () => new Response(null, { status: 204 }),
    'GET /api/me': () => (signedIn ? Response.json(me) : Response.json({}, { status: 401 })),
    'GET /api/lists': () =>
      Response.json({ lists: [list(), list({ id: 'l2', slug: 'draft', lifecycle: 'draft' })] }),
    'GET /api/lists/best-sci-fi': () => Response.json(list()),
    'GET /api/lists/closed': () => Response.json(list({ lifecycle: 'closed', slug: 'closed' })),
    'GET /api/lists/best-sci-fi/ballot': () =>
      Response.json({ listId: 'list-1', scores: { a: 8 } }),
    'GET /api/lists/closed/ballot': () => Response.json({ listId: 'list-1', scores: { a: 8 } }),
    'GET /api/lists/best-sci-fi/leaderboard': () =>
      Response.json({
        hidden: false,
        computedAt: new Date().toISOString(),
        minVotes: 3,
        rows: [
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
        ],
      }),
    'GET /api/lists/closed/leaderboard': () =>
      Response.json({ hidden: true, revealsAt: '2026-01-10T00:00:00.000Z' }),
    'GET /api/catalog/sources': () =>
      Response.json({ sources: ['tmdb-movie', 'freeform', 'preset'] }),
    'GET /api/roles': () =>
      Response.json({
        labels: [{ roleId: '900000000000000077', name: 'Film Club' }],
        version: 'v1',
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
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('every page passes automated accessibility checks', () => {
  test.each([
    ['the welcome page, signed out', '/', false],
    ['a sign-in failure message', '/?login=identity.not-a-member', false],
    ['the lists index', '/', true],
    ['an open list with rating and leaderboard', '/lists/best-sci-fi', true],
    ['a closed list with hidden results', '/lists/closed', true],
    ['the new-list editor', '/admin/lists/new', true],
    ['the editor of a published list', '/admin/lists/best-sci-fi', true],
    ['the roles page', '/admin/roles', true],
    ['the privacy page', '/privacy', false],
    ['not found', '/nope', false],
    ['the welcome page in demo mode', '/', false, true],
    ['a list page in demo mode', '/lists/best-sci-fi', true, true],
  ])('%s', async (_, path, signedIn, demo = false) => {
    const wrapper = await renderAt(path, signedIn, demo);
    await expectAccessible(document.body);
    wrapper.unmount();
  });
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

describe('site-wide content', () => {
  test('the footer names the community and credits, and links the source and privacy page', async () => {
    const wrapper = await renderAt('/privacy', false);
    const footer = document.querySelector('footer');
    expect(footer?.textContent).toContain('Connected to Film Club');
    expect(footer?.textContent).toContain('Made by Moriel Schottlender');
    expect(footer?.querySelector('a[href="https://moriel.tech"]')).not.toBeNull();
    expect(
      footer?.querySelector('a[href="https://github.com/mooeypoo/hivemind"]')?.textContent,
    ).toBe('Source code');
    expect(footer?.textContent).toContain('GPL-3.0-or-later');
    expect(footer?.textContent).toContain('Movie data from TMDB');
    wrapper.unmount();
  });

  test('without movie lists, the footer does not mention TMDB', async () => {
    const wrapper = await renderAt('/privacy', false);
    site.info = { community: null, offersMovieData: false, demo: false };
    await flushPromises();
    expect(document.querySelector('footer')?.textContent).not.toContain('TMDB');
    expect(document.querySelector('footer')?.textContent).toContain(
      'Connected to a Discord community',
    );
    wrapper.unmount();
  });

  test('the welcome page names the community and offers to join it', async () => {
    const wrapper = await renderAt('/', false);
    expect(document.querySelector('.hero')?.textContent).toContain('For members of Film Club');
    expect(document.querySelector('a[href="https://discord.gg/x"]')?.textContent.trim()).toBe(
      'Join the server',
    );
    wrapper.unmount();
  });

  test('the privacy page explains storage, cookies, and download and delete', async () => {
    const wrapper = await renderAt('/privacy', false);
    const headings = [...document.querySelectorAll('h2')].map((h) => h.textContent);
    expect(headings).toEqual([
      'What we store about you',
      'What we never store',
      'Cookies',
      'Download my data',
      'Delete my data',
      'Who owns what',
      'Questions',
    ]);
    expect(document.title).toBe('Privacy · Votable Lists');
    wrapper.unmount();
  });

  test('each page has its own title', async () => {
    const wrapper = await renderAt('/lists/best-sci-fi', true);
    expect(document.title).toBe('Best Sci-Fi Movies · Votable Lists');
    wrapper.unmount();
  });
});
