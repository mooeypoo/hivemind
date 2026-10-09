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
});
