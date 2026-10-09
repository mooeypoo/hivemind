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
  test('offers the sources this site has', async () => {
    stubApi({ 'GET /api/catalog/sources': sources, 'GET /api/roles': roles });
    const editor = await mountAt('/admin/lists/new');
    expect(editor.findAll('input[name=source]').map((input) => input.attributes('value'))).toEqual([
      'tmdb-movie',
      'freeform',
      'preset',
    ]);
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
});
