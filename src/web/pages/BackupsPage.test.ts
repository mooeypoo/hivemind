// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { site } from '../state/site.ts';
import { stubApi } from '../testing/fixtures.ts';
import BackupsPage from './BackupsPage.vue';

const Blank = { render: () => null };
const backupFile = {
  format: 'votable-lists-backup',
  version: 1,
  exportedAt: '2026-03-01T00:00:00.000Z',
  keyId: 'k',
  lists: [
    {
      list: { config: { title: 'Games', slug: 'games' } },
      entries: [{}, {}],
      nominators: [],
      preset: null,
      ballots: 'v1.sealed',
    },
  ],
};

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/backups', component: BackupsPage },
      { path: '/lists/:slug', name: 'list', component: Blank },
    ],
  });
  await router.push('/admin/backups');
  await router.isReady();
  return mount(BackupsPage, { global: { plugins: [router] } });
};

const chooseFile = async (page: Awaited<ReturnType<typeof mountPage>>, contents: string) => {
  const input = page.get('#backup-file');
  const file = new File([contents], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
};

beforeEach(() => {
  site.info = { community: null, offersMovieData: true, demo: false, backups: true };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BackupsPage', () => {
  test('explains how to turn backups on when they are off', async () => {
    site.info = { community: null, offersMovieData: true, demo: false, backups: false };
    const page = await mountPage();
    expect(page.text()).toContain('Backups aren’t set up on this site');
    expect(page.find('#backup-file').exists()).toBe(false);
  });

  test('previews a chosen file, then imports it and shows what happened', async () => {
    const calls = stubApi({
      'POST /api/admin/backup': () =>
        Response.json({
          keyMatched: true,
          lists: [
            {
              ok: true,
              title: 'Games',
              slug: 'games-2',
              renamed: true,
              hidden: true,
              entries: 2,
              votesRestored: 3,
              membersLeftOut: 1,
            },
          ],
        }),
    });
    const page = await mountPage();
    await chooseFile(page, JSON.stringify(backupFile));
    expect(page.text()).toContain('with 1 list (1 with votes)');
    expect(page.text()).toContain('Games · 2 entries');

    await page
      .findAll('button')
      .find((b) => b.text() === 'Import this list')
      ?.trigger('click');
    await flushPromises();
    expect(calls[0]?.body).toEqual(backupFile);
    expect(page.text()).toContain('2 entries, 3 votes restored, 1 member left out.');
    expect(page.text()).toContain('/lists/games-2');
  });

  test('says when the key differed, and refuses files that are not backups', async () => {
    stubApi({
      'POST /api/admin/backup': () => Response.json({ keyMatched: false, lists: [] }),
    });
    const page = await mountPage();
    await chooseFile(page, '{"hello":"world"}');
    expect(page.text()).toContain('That file isn’t a backup from this site.');
    await chooseFile(page, JSON.stringify(backupFile));
    await page
      .findAll('button')
      .find((b) => b.text() === 'Import this list')
      ?.trigger('click');
    await flushPromises();
    expect(page.text()).toContain('made with a different backup key');
  });
});
