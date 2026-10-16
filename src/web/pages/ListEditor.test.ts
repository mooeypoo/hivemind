// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { openTmdbList, stubApi } from '../testing/fixtures.ts';
import ListEditor from './ListEditor.vue';

const Blank = { render: () => null };

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/lists/new', name: 'new-list', component: ListEditor },
      { path: '/', name: 'lists', component: Blank },
      { path: '/admin/lists/:slug', name: 'edit-list', component: ListEditor },
      { path: '/lists/:slug', name: 'list', component: Blank },
      { path: '/admin/roles', name: 'roles', component: Blank },
    ],
  });
  await router.push(path);
  await router.isReady();
  const editor = mount(ListEditor, { global: { plugins: [router] } });
  await flushPromises();
  return editor;
};

const sources = () => Response.json({ sources: ['tmdb-movie', 'freeform', 'preset'] });
const roles = () =>
  Response.json({ labels: [{ roleId: '900000000000000077', name: 'Film Club' }], version: 'v1' });

beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListEditor', () => {
  test.each(['draft', 'open', 'archived'] as const)(
    'a %s list requires a typed slug before permanent deletion',
    async (lifecycle) => {
      const list = openTmdbList({ lifecycle });
      const calls = stubApi({
        'GET /api/catalog/sources': sources,
        'GET /api/roles': roles,
        'GET /api/lists/best-sci-fi': () => Response.json(list),
        [`DELETE /api/lists/${list.id}`]: () => new Response(null, { status: 204 }),
      });
      const editor = await mountAt('/admin/lists/best-sci-fi');
      await editor
        .findAll('button')
        .find((button) => button.text() === 'Delete list…')
        ?.trigger('click');
      await flushPromises();
      const dialog = editor.get('dialog[open]');
      const confirm = dialog
        .findAll('button')
        .find((button) => button.text() === 'Delete permanently');
      expect(confirm?.attributes('disabled')).toBeDefined();
      expect(dialog.text()).toContain('withdrawn');
      expect(dialog.text()).toContain('scores');
      await dialog.get('input').setValue('wrong');
      expect(confirm?.attributes('disabled')).toBeDefined();
      await dialog.get('input').setValue(list.slug);
      await confirm?.trigger('click');
      await flushPromises();
      expect(calls.find((call) => call.method === 'DELETE')).toMatchObject({
        url: `/api/lists/${list.id}`,
        body: { confirmation: list.slug },
      });
      expect(editor.vm.$route.fullPath).toBe('/?deleted=1');
      editor.unmount();
    },
  );

  test('a failed deletion stays in the dialog with an explicit retry and survives reload', async () => {
    let attempt = 0;
    const list = openTmdbList({ deleting: true });
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(list),
      [`DELETE /api/lists/${list.id}`]: () => {
        attempt += 1;
        return attempt === 1
          ? Response.json(
              { error: { code: 'lists.deletion-busy', message: 'Earlier writes must finish.' } },
              { status: 409 },
            )
          : new Response(null, { status: 204 });
      },
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.find('form').exists()).toBe(false);
    expect(editor.text()).toContain('Deletion in progress');
    await editor
      .findAll('button')
      .find((button) => button.text() === 'Retry deletion…')
      ?.trigger('click');
    await flushPromises();
    const dialog = editor.get('dialog[open]');
    await dialog.get('input').setValue(list.slug);
    const confirm = dialog
      .findAll('button')
      .find((button) => button.text() === 'Delete permanently');
    await confirm?.trigger('click');
    await flushPromises();
    expect(dialog.get('[role=alert]').text()).toContain('Earlier writes must finish.');
    expect(editor.vm.$route.name).toBe('edit-list');
    await confirm?.trigger('click');
    await flushPromises();
    expect(editor.vm.$route.name).toBe('lists');
    editor.unmount();
  });

  test('an eligible published list can change only its item source', async () => {
    const list = openTmdbList({ entries: [], itemSourceEditable: true });
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(list),
      [`PUT /api/lists/${list.id}`]: () =>
        Response.json({ ...list, itemSource: { kind: 'freeform' } }),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.get('#editor-items').attributes('disabled')).toBeUndefined();
    expect(editor.get('#editor-rating').attributes('disabled')).toBeDefined();
    expect(editor.get('#editor-roles').attributes('disabled')).toBeDefined();
    await editor.get('input[value=freeform]').setValue(true);
    await editor.get('form').trigger('submit');
    await flushPromises();
    const body = calls.find((call) => call.method === 'PUT')?.body;
    expect(body).toMatchObject({ itemSource: { kind: 'freeform' } });
    expect(body).not.toHaveProperty('entryMode');
    expect(body).not.toHaveProperty('scale');
    editor.unmount();
  });

  test('restores an unsaved published source selection without unlocking other settings', async () => {
    sessionStorage.setItem(
      'draft:editor:best-sci-fi',
      JSON.stringify({ sourceKind: 'freeform', scaleMin: 99 }),
    );
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList({ itemSourceEditable: true })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect((editor.get('input[value=freeform]').element as HTMLInputElement).checked).toBe(true);
    expect(editor.get('#editor-rating').attributes('disabled')).toBeDefined();
    editor.unmount();
  });

  test('offers TVDB only when available and sends the selected series source', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': () =>
        Response.json({ sources: ['tvdb-series', 'freeform', 'preset'] }),
      'GET /api/roles': roles,
      'POST /api/lists': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', itemSource: { kind: 'tvdb-series' } }), {
          status: 201,
        }),
    });
    const editor = await mountAt('/admin/lists/new');
    expect(editor.find('input[value=tmdb-movie]').exists()).toBe(false);
    expect(editor.text()).toContain('TV shows (TheTVDB)');
    await editor.get('input[value=tvdb-series]').setValue(true);
    await editor.get('#title').setValue('Best TV Shows');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      itemSource: { kind: 'tvdb-series' },
    });
    editor.unmount();
  });

  test('offers the sources this site has', async () => {
    stubApi({ 'GET /api/catalog/sources': sources, 'GET /api/roles': roles });
    const editor = await mountAt('/admin/lists/new');
    expect(editor.findAll('input[name=source]').map((input) => input.attributes('value'))).toEqual([
      'tmdb-movie',
      'freeform',
      'preset',
    ]);
    expect(editor.find('input[value=tvdb-series]').exists()).toBe(false);
    expect(editor.find('input[value=igdb-game]').exists()).toBe(false);
  });

  test('offers IGDB only when available and sends the selected game source', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': () =>
        Response.json({ sources: ['igdb-game', 'freeform', 'preset'] }),
      'GET /api/roles': roles,
      'POST /api/lists': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', itemSource: { kind: 'igdb-game' } }), {
          status: 201,
        }),
    });
    const editor = await mountAt('/admin/lists/new');
    expect(editor.text()).toContain('Games (IGDB)');
    await editor.get('input[value=igdb-game]').setValue(true);
    await editor.get('#title').setValue('Best Games');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      itemSource: { kind: 'igdb-game' },
    });
    editor.unmount();
  });

  test('the address follows the title until you edit it', async () => {
    stubApi({ 'GET /api/catalog/sources': sources, 'GET /api/roles': roles });
    const editor = await mountAt('/admin/lists/new');
    await editor.get('#title').setValue('Best Sci-Fi Movies');
    expect((editor.get('#slug').element as HTMLInputElement).value).toBe('best-sci-fi-movies');
    await editor.get('#slug').setValue('scifi');
    await editor.get('#title').setValue('Best Sci-Fi Films');
    expect((editor.get('#slug').element as HTMLInputElement).value).toBe('scifi');
  });

  test('shows CSV problems row by row', async () => {
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'POST /api/catalog/presets': () =>
        Response.json(
          {
            error: {
              code: 'catalog.invalid-csv',
              message: 'The CSV could not be imported.',
              details: ['Row 3: duplicates row 2.'],
            },
          },
          { status: 422 },
        ),
    });
    const editor = await mountAt('/admin/lists/new');
    await editor.get('input[value=preset]').setValue(true);
    await editor.get('#csv').setValue('title\nBlue\nblue');
    await editor
      .findAll('button')
      .find((button) => button.text() === 'Import CSV')
      ?.trigger('click');
    await flushPromises();
    expect(editor.text()).toContain('Row 3: duplicates row 2.');
  });

  test('sends unlimited nominations and the ticked roles', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'POST /api/lists': () => Response.json(openTmdbList({ lifecycle: 'draft' }), { status: 201 }),
    });
    const editor = await mountAt('/admin/lists/new');
    await editor.get('#title').setValue('Club picks');
    const checkbox = (label: string) =>
      editor
        .findAll('input[type=checkbox]')
        .find((box) => box.element.closest('label')?.textContent.includes(label));
    await checkbox('Unlimited')?.setValue(true);
    expect((editor.get('#cap').element as HTMLInputElement).disabled).toBe(true);
    await checkbox('Film Club')?.setValue(true);
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      maxNominationsPerMember: null,
      requiredRoleIds: ['900000000000000077'],
    });
  });

  test('keeps a required role that has no name yet, and links to the Roles page', async () => {
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(
          openTmdbList({ lifecycle: 'draft', requiredRoleIds: ['900000000000000099'] }),
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    const unnamed = editor
      .findAll('input[type=checkbox]')
      .find((box) =>
        box.element.closest('label')?.textContent.includes('Unnamed role (900000000000000099)'),
      );
    expect((unnamed?.element as HTMLInputElement | undefined)?.checked).toBe(true);
    expect(editor.text()).toContain('Name it on the Roles page');
  });

  test('a scheduled list locks everything but the description and closing time', async () => {
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList({ lifecycle: 'scheduled' })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.text()).toContain('its settings are fixed');
    const disabled = (selector: string) =>
      (editor.get(selector).element as HTMLInputElement).disabled ||
      editor.get(selector).element.closest('fieldset')?.disabled === true;
    expect(disabled('#title')).toBe(true);
    expect(disabled('#scale-max')).toBe(true);
    expect(disabled('#opens')).toBe(true);
    expect(disabled('#description')).toBe(false);
    expect(disabled('#closes')).toBe(false);
  });

  test('a draft can be published right away and open-ended, without entering any dates', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
      'PUT /api/lists/list-1': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
      'POST /api/lists/list-1/schedule': () => Response.json(openTmdbList()),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.text()).toContain(
      'From this moment members can see the list, nominate and rate.',
    );
    expect(editor.text()).toContain(
      'When voting closes, scores are final and the results are shown.',
    );
    const publish = editor.findAll('button').find((b) => b.text() === 'Publish now');
    expect((publish?.element as HTMLButtonElement | undefined)?.disabled).toBe(false);
    await publish?.trigger('click');
    await flushPromises();
    const body = calls.find((call) => call.url.endsWith('/schedule'))?.body as {
      opensAt: string;
      closesAt: string | null;
    };
    expect(body.closesAt).toBeNull();
    expect(Math.abs(Date.parse(body.opensAt) - Date.now())).toBeLessThan(60_000);
  });

  test('choosing a set time without one says what is missing', async () => {
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('input[name=end][value=at]').setValue(true);
    expect(editor.text()).toContain('Choose when voting closes, or let it stay open.');
    const button = editor.findAll('button').find((b) => b.text() === 'Publish now');
    expect((button?.element as HTMLButtonElement | undefined)?.disabled).toBe(true);
  });

  test('a published list can be hidden, and voting closed after confirming', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList()),
      'PUT /api/lists/list-1/visibility': () =>
        Response.json(openTmdbList({ visibility: 'hidden' })),
      'POST /api/lists/list-1/close': () => Response.json(openTmdbList({ lifecycle: 'closed' })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('input[name=visibility][value=hidden]').setValue(true);
    await flushPromises();
    expect(calls.find((call) => call.url.endsWith('/visibility'))?.body).toEqual({
      visibility: 'hidden',
    });
    expect(editor.text()).toContain('Hidden: only Admins can see it now.');

    await editor
      .findAll('button')
      .find((b) => b.text() === 'Close voting now')
      ?.trigger('click');
    expect(calls.some((call) => call.url.endsWith('/close'))).toBe(false);
    await editor
      .findAll('button')
      .find((b) => b.text() === 'Close voting')
      ?.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.endsWith('/close'))).toBe(true);
  });

  test('refreshes missing movie details and reports the result', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList()),
      'POST /api/lists/list-1/refresh-movie-details': () =>
        Response.json({ eligible: 4, updated: 2, skipped: 1, failed: 1, remaining: 1, next: null }),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');

    const refresh = editor
      .findAll('button')
      .find((button) => button.text().trim() === 'Refresh missing movie details');
    await refresh?.trigger('click');
    await flushPromises();

    expect(calls.find((call) => call.url.endsWith('/refresh-movie-details'))?.method).toBe('POST');
    expect(editor.text()).toContain(
      '2 updated, 1 already had a synopsis, 1 could not be refreshed.',
    );
    expect(editor.text()).toContain('1 still need attention; run refresh again to continue.');
  });

  test('refreshes TVDB show posters in batches, continuing where the last run stopped', async () => {
    let run = 0;
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ itemSource: { kind: 'tvdb-series' } })),
      'POST /api/lists/list-1/refresh-movie-details': () =>
        Response.json(
          ++run === 1
            ? {
                eligible: 25,
                updated: 18,
                skipped: 2,
                failed: 0,
                remaining: 5,
                next: 'tvdb-series.9',
              }
            : { eligible: 25, updated: 5, skipped: 0, failed: 0, remaining: 0, next: null },
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.text()).not.toContain('Refresh missing movie details');

    const button = () =>
      editor
        .findAll('button')
        .find((b) =>
          /^(Refresh show posters and details|Continue refreshing shows)$/.test(b.text().trim()),
        );
    expect(button()?.text().trim()).toBe('Refresh show posters and details');
    await button()?.trigger('click');
    await flushPromises();
    expect(editor.text()).toContain('18 updated, 2 already up to date, 0 could not be refreshed.');
    expect(editor.text()).toContain('5 still to check; run refresh again to continue.');
    expect(button()?.text().trim()).toBe('Continue refreshing shows');

    await button()?.trigger('click');
    await flushPromises();
    const urls = calls.filter((c) => c.url.includes('/refresh-movie-details')).map((c) => c.url);
    expect(urls).toEqual([
      '/api/lists/list-1/refresh-movie-details',
      '/api/lists/list-1/refresh-movie-details?after=tvdb-series.9',
    ]);
    expect(button()?.text().trim()).toBe('Refresh show posters and details');
  });
});
