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
  test.each([
    ['draft', 'public', 'Current saved draft — not published'],
    ['open', 'hidden', 'Current saved version — hidden from members'],
    ['open', 'public', 'This is the version members see now.'],
  ] as const)(
    'comparison labels saved %s/%s settings accurately',
    async (lifecycle, visibility, label) => {
      sessionStorage.setItem(
        'draft:editor:best-sci-fi',
        JSON.stringify({
          form: { description: 'Unfinished description' },
          settingsVersion: 0,
          lifecycle,
        }),
      );
      stubApi({
        'GET /api/catalog/sources': sources,
        'GET /api/roles': roles,
        'GET /api/lists/best-sci-fi': () =>
          Response.json(openTmdbList({ lifecycle, visibility, settingsVersion: 1 })),
      });
      const editor = await mountAt('/admin/lists/best-sci-fi');
      const comparison = editor.get('.settings-comparison');
      expect(editor.get('.settings-change h3').text()).toBe('Description');
      expect(comparison.get('.settings-version--saved').text()).toContain(label);
      expect(comparison.findAll('.settings-version__value').at(1)?.text()).toBe(
        'Unfinished description',
      );
      expect(comparison.text()).toContain(
        'Only in this browser tab. Members cannot see these edits.',
      );
      editor.unmount();
    },
  );

  test.each([undefined, 0])(
    'matching restored settings on a busy published list need no comparison (cached version: %s)',
    async (settingsVersion) => {
      sessionStorage.setItem(
        'draft:editor:best-sci-fi',
        JSON.stringify({
          form: { description: 'Saved description' },
          settingsVersion,
          lifecycle: 'open',
        }),
      );
      const calls = stubApi({
        'GET /api/catalog/sources': sources,
        'GET /api/roles': roles,
        'GET /api/lists/best-sci-fi': () =>
          Response.json(openTmdbList({ settingsVersion: 2, description: 'Saved description' })),
        'PUT /api/lists/list-1': () =>
          Response.json(openTmdbList({ settingsVersion: 3, description: 'Updated description' })),
      });
      const editor = await mountAt('/admin/lists/best-sci-fi');
      expect(editor.find('.settings-conflict').exists()).toBe(false);
      await editor.get('#description').setValue('Updated description');
      await editor.get('form').trigger('submit');
      await flushPromises();
      expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
        expectedSettingsVersion: 2,
        description: 'Updated description',
      });
      editor.unmount();
    },
  );

  test('different restored edits on a published list explain recovery and show styled choices immediately', async () => {
    sessionStorage.setItem(
      'draft:editor:best-sci-fi',
      JSON.stringify({
        form: { description: 'My unsaved description' },
        settingsVersion: 0,
        lifecycle: 'open',
      }),
    );
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ settingsVersion: 1, description: 'Saved description' })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    const conflict = editor.get('.settings-conflict');
    expect(conflict.text()).toContain('Your browser recovered edits you didn’t save.');
    expect(conflict.text()).toContain('Nominations and votes are not part of this comparison.');
    expect(conflict.text()).toContain('My unsaved description');
    expect(conflict.text()).toContain('Saved description');
    expect(conflict.findAll('button').map((button) => button.text())).toEqual([
      'Discard my edits and load saved settings',
      'Keep my unsaved edits',
    ]);
    expect(conflict.findAll('button').every((button) => button.classes().includes('button'))).toBe(
      true,
    );
    await conflict.get('button').trigger('click');
    expect(editor.find('.settings-conflict').exists()).toBe(false);
    expect(sessionStorage.getItem('draft:editor:best-sci-fi')).toBeNull();
    editor.unmount();
  });

  test('comparing a rejected save with identical settings resumes editing with explicit feedback', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList()),
      'GET /api/lists/list-1': () =>
        Response.json(openTmdbList({ settingsVersion: 1, description: 'My edit' })),
      'PUT /api/lists/list-1': () =>
        Response.json(
          { error: { code: 'lists.settings-changed', message: 'Settings changed' } },
          { status: 409 },
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('#description').setValue('My edit');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(editor.get('.settings-conflict').text()).toContain(
      'The settings saved on the site changed while you were editing.',
    );
    const compare = editor.get('.settings-conflict button');
    expect(compare.classes()).toContain('button');
    await compare.trigger('click');
    await flushPromises();
    expect(editor.find('.settings-conflict').exists()).toBe(false);
    expect(editor.text()).toContain('Your form already matches the latest saved settings');
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    editor.unmount();
  });

  test('free text warns admins about unfiltered submissions when choosing and reviewing', async () => {
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    const choice = editor.get('input[value=freeform]').element.closest('label');
    expect(choice?.textContent).toContain(
      'No automatic content filter: any words or free text can be submitted, so moderation may be needed.',
    );
    await editor.get('input[value=freeform]').setValue(true);
    await editor.get('[data-review-publish]').trigger('click');
    await flushPromises();
    expect(editor.get('dialog[open]').text()).toContain(
      'No automatic content filter: any words or free text can be submitted, so moderation may be needed.',
    );
    editor.unmount();
  });

  test('the form cannot accept input before its saved settings arrive', async () => {
    stubApi({ 'GET /api/catalog/sources': sources, 'GET /api/roles': roles });
    const fetch = globalThis.fetch;
    let respond: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) =>
      input === '/api/lists/best-sci-fi'
        ? new Promise<Response>((resolve) => {
            respond = resolve;
          })
        : fetch(input, init),
    );
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.find('form').exists()).toBe(false);
    expect(editor.text()).toContain('Loading list settings');
    if (respond === undefined) throw new Error('Missing list request');
    respond(Response.json(openTmdbList({ description: 'Saved description' })));
    await flushPromises();
    expect((editor.get('#description').element as HTMLTextAreaElement).value).toBe(
      'Saved description',
    );
    editor.unmount();
  });
  test('a draft published by another admin keeps restored input for comparison but cannot rebase locked settings', async () => {
    sessionStorage.setItem(
      'draft:editor:best-sci-fi',
      JSON.stringify({
        form: { title: 'My unsaved title', description: 'My description' },
        settingsVersion: 0,
        lifecycle: 'draft',
      }),
    );
    stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList({ settingsVersion: 1 })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect((editor.get('#title').element as HTMLInputElement).value).toBe('My unsaved title');
    expect(editor.get('.settings-conflict').text()).toContain('My unsaved title');
    expect(editor.get('.settings-conflict').text()).toContain('list’s status has changed');
    expect(
      editor
        .findAll('button')
        .find((button) => button.text() === 'Keep my unsaved edits')
        ?.attributes('disabled'),
    ).toBeDefined();
    editor.unmount();
  });
  test('a stale save keeps input and requires an explicit comparison before saving against the latest version', async () => {
    let version = 0;
    const draft = (description: string) =>
      openTmdbList({ lifecycle: 'draft', schedule: null, settingsVersion: version, description });
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(draft(version === 0 ? '' : 'Other admin')),
      'GET /api/lists/list-1': () => Response.json(draft('Other admin')),
      'PUT /api/lists/list-1': (call) => {
        const body = call.body as { expectedSettingsVersion: number; description: string };
        if (body.expectedSettingsVersion !== version)
          return Response.json(
            { error: { code: 'lists.settings-changed', message: 'Settings changed' } },
            { status: 409 },
          );
        version += 1;
        return Response.json(draft(body.description));
      },
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('#description').setValue('My unsaved description');
    version = 1;
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(editor.text()).toContain('Review settings before saving');
    expect((editor.get('#description').element as HTMLTextAreaElement).value).toBe(
      'My unsaved description',
    );
    await editor.get('form').trigger('submit');
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    await editor
      .findAll('button')
      .find((button) => button.text() === 'Compare latest settings')
      ?.trigger('click');
    await flushPromises();
    expect(editor.text()).toContain('Other admin');
    expect(editor.text()).toContain('My unsaved description');
    await editor
      .findAll('button')
      .find((button) => button.text() === 'Keep my unsaved edits')
      ?.trigger('click');
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1);
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.filter((call) => call.method === 'PUT').at(-1)?.body).toMatchObject({
      expectedSettingsVersion: 1,
      description: 'My unsaved description',
    });
    editor.unmount();
  });

  test('restored input keeps its original version instead of silently rebasing onto another admin’s changes', async () => {
    let version = 0;
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(
          openTmdbList({
            lifecycle: 'draft',
            schedule: null,
            settingsVersion: version,
            description: version === 0 ? '' : 'Other admin',
          }),
        ),
    });
    const first = await mountAt('/admin/lists/best-sci-fi');
    await first.get('#description').setValue('Keep across reload');
    first.unmount();
    version = 1;
    const restored = await mountAt('/admin/lists/best-sci-fi');
    expect((restored.get('#description').element as HTMLTextAreaElement).value).toBe(
      'Keep across reload',
    );
    expect(restored.text()).toContain('Review settings before saving');
    expect(restored.text()).toContain('Other admin');
    await restored.get('form').trigger('submit');
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
    await restored
      .findAll('button')
      .find((button) => button.text() === 'Discard my edits and load saved settings')
      ?.trigger('click');
    expect((restored.get('#description').element as HTMLTextAreaElement).value).toBe('Other admin');
    restored.unmount();
  });

  test('publishing uses the saved version and a conflict closes review without losing the form', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null, settingsVersion: 3 })),
      'PUT /api/lists/list-1': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null, settingsVersion: 4 })),
      'POST /api/lists/list-1/schedule': () =>
        Response.json(
          { error: { code: 'lists.settings-changed', message: 'Changed during publication' } },
          { status: 409 },
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('#description').setValue('Reviewed description');
    await editor.get('[data-review-publish]').trigger('click');
    await editor.get('#publish-locks').setValue(true);
    await editor.get('[data-confirm-publish]').trigger('click');
    await flushPromises();
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      expectedSettingsVersion: 3,
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      expectedSettingsVersion: 4,
    });
    expect(editor.find('dialog[open]').exists()).toBe(false);
    expect(editor.text()).toContain('Review settings before saving');
    expect((editor.get('#description').element as HTMLTextAreaElement).value).toBe(
      'Reviewed description',
    );
    editor.unmount();
  });

  test('new lists require an item choice and keep names visible with private individual scores', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
    });
    const editor = await mountAt('/admin/lists/new');
    expect(editor.findAll('input[name=source]:checked')).toHaveLength(0);
    await editor.get('#title').setValue('Community favourites');
    await editor.get('form').trigger('submit');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(editor.get('p[role=alert]').text()).toContain('Choose an item type');
    expect(
      (editor.get('input[name=score-visibility][value=private]').element as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(editor.get('#editor-rating').text()).toContain('Fixed when published');
    editor.unmount();
  });

  test('review explains named scores and requires both acknowledgments before publishing', async () => {
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
    await editor.get('input[name=score-visibility][value=public]').setValue(true);
    await editor.get('input[name=visibility][value=after-close]').setValue(true);
    await editor.get('[data-review-publish]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'PUT' || call.method === 'POST')).toBe(false);
    const dialog = editor.get('dialog[open]');
    expect(dialog.text()).toContain('Standings stay hidden from everyone, including admins');
    expect(dialog.text()).toContain('No automatic end');
    const confirm = dialog.get('[data-confirm-publish]');
    expect(confirm.attributes('disabled')).toBeDefined();
    await dialog.get('#publish-locks').setValue(true);
    expect(confirm.attributes('disabled')).toBeDefined();
    await dialog.get('#publish-named-scores').setValue(true);
    await confirm.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.endsWith('/schedule'))).toBe(true);
    editor.unmount();
  });

  test('invalid date order blocks review without saving or publishing', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('input[name=opens][value=at]').setValue(true);
    await editor.get('#opens').setValue('2099-06-10T18:00');
    await editor.get('#nominations-close').setValue('2099-06-09T18:00');
    expect(editor.text()).toContain('Nominations must close after participation opens');
    expect(editor.get('[data-review-publish]').attributes('disabled')).toBeDefined();
    expect(calls.some((call) => call.method === 'PUT' || call.method === 'POST')).toBe(false);
    editor.unmount();
  });

  test.each([
    ['scale', 'Choose whole-number scores'],
    ['preset', 'Import your collection'],
  ])('invalid %s blocks publishing review', async (kind, message) => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(
          openTmdbList({ lifecycle: 'draft', schedule: null, itemSourceEditable: true }),
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    if (kind === 'scale') await editor.get('#scale-min').setValue(10);
    else await editor.get('input[value=preset]').setValue(true);
    await editor.get('[data-review-publish]').trigger('click');
    expect(editor.find('dialog[open]').exists()).toBe(false);
    expect(editor.get('p[role=alert]').text()).toContain(message);
    expect(calls.some((call) => call.method === 'PUT' || call.method === 'POST')).toBe(false);
    editor.unmount();
  });

  test('removing a published nomination limit requires confirmation before saving', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(openTmdbList()),
      'PUT /api/lists/list-1': () => Response.json(openTmdbList({ maxNominationsPerMember: null })),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('#unlimited').setValue(true);
    await editor.get('form').trigger('submit');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    const dialog = editor.get('dialog[open]');
    expect(dialog.text()).toContain('cannot be restored');
    await dialog
      .findAll('button')
      .find((button) => button.text() === 'Cancel')
      ?.trigger('click');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    await editor.get('form').trigger('submit');
    await editor
      .get('dialog[open]')
      .findAll('button')
      .find((button) => button.text() === 'Save with unlimited nominations')
      ?.trigger('click');
    await flushPromises();
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      maxNominationsPerMember: null,
    });
    editor.unmount();
  });

  test('saving draft shares dates and reload restores them without browser storage', async () => {
    const plan = {
      opensAt: new Date('2099-01-01T18:00').toISOString(),
      nominationsCloseAt: null,
      closesAt: null,
    };
    const draft = openTmdbList({ lifecycle: 'draft', schedule: null, draftSchedule: plan });
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(draft),
      'PUT /api/lists/list-1': () => Response.json(draft),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('input[name=opens][value=at]').setValue(true);
    await editor.get('#opens').setValue('2099-01-01T18:00');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect((editor.get('#opens').element as HTMLInputElement).value).toBe('2099-01-01T18:00');
    expect(calls.find((call) => call.method === 'PUT')?.body).toMatchObject({
      draftSchedule: plan,
    });
    editor.unmount();
    sessionStorage.clear();
    const reloaded = await mountAt('/admin/lists/best-sci-fi');
    expect((reloaded.get('#opens').element as HTMLInputElement).value).toBe('2099-01-01T18:00');
    expect(
      (reloaded.get('input[name=end][value=open-ended]').element as HTMLInputElement).checked,
    ).toBe(true);
    reloaded.unmount();
  });

  test('an elapsed saved plan can remain a draft but cannot be published', async () => {
    const plan = {
      opensAt: '2020-01-01T18:00:00.000Z',
      nominationsCloseAt: null,
      closesAt: '2020-02-01T18:00:00.000Z',
    };
    const draft = openTmdbList({ lifecycle: 'draft', schedule: null, draftSchedule: plan });
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () => Response.json(draft),
      'PUT /api/lists/list-1': () => Response.json(draft),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    expect(editor.get('[data-review-publish]').attributes('disabled')).toBeDefined();
    expect(editor.text()).toContain('Voting must close in the future.');
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.some((call) => call.method === 'PUT')).toBe(true);
    expect(calls.some((call) => call.url.endsWith('/schedule'))).toBe(false);
    editor.unmount();
  });

  test('failed publishing preserves the review and explains that the draft was saved', async () => {
    const calls = stubApi({
      'GET /api/catalog/sources': sources,
      'GET /api/roles': roles,
      'GET /api/lists/best-sci-fi': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
      'PUT /api/lists/list-1': () =>
        Response.json(openTmdbList({ lifecycle: 'draft', schedule: null })),
      'POST /api/lists/list-1/schedule': () =>
        Response.json(
          { error: { code: 'lists.conflict', message: 'Please retry.' } },
          { status: 409 },
        ),
    });
    const editor = await mountAt('/admin/lists/best-sci-fi');
    await editor.get('[data-review-publish]').trigger('click');
    await flushPromises();
    const dialog = editor.get('dialog[open]');
    await dialog.get('#publish-locks').setValue(true);
    await dialog.get('[data-confirm-publish]').trigger('click');
    await flushPromises();
    expect(dialog.get('[role=alert]').text()).toContain('Please retry.');
    expect(dialog.text()).toContain(
      'Draft settings and planned dates saved, but publishing was not confirmed',
    );
    expect(calls.filter((call) => call.url.endsWith('/schedule'))).toHaveLength(1);
    editor.unmount();
  });

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
    await editor.get('input[value=freeform]').setValue(true);
    const checkbox = (label: string) =>
      editor
        .findAll('input[type=checkbox]')
        .find((box) => box.element.closest('label')?.textContent.includes(label));
    expect((editor.get('#unlimited').element as HTMLInputElement).checked).toBe(true);
    expect(editor.get('.editor-next-step').text()).toContain('Next step: choose dates and publish');
    expect((editor.get('#cap').element as HTMLInputElement).disabled).toBe(true);
    await checkbox('Film Club')?.setValue(true);
    await editor.get('form').trigger('submit');
    await flushPromises();
    expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      maxNominationsPerMember: null,
      requiredRoleIds: ['900000000000000077'],
      showNominators: true,
      scoreVisibility: 'private',
      ranking: { strategy: 'bayesian', minVotes: 2 },
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
    expect(editor.text()).toContain('From this moment eligible members can nominate and rate.');
    expect(editor.text()).toContain(
      'When voting closes, scores are final and the results are shown.',
    );
    const publish = editor.find('[data-review-publish]');
    expect((publish.element as HTMLButtonElement).disabled).toBe(false);
    await publish.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.url.endsWith('/schedule'))).toBe(false);
    const dialog = editor.get('dialog[open]');
    const fact = (label: string) =>
      dialog
        .findAll('dl > div')
        .find((row) => row.find('dt').text() === label)
        ?.get('dd')
        .text();
    expect(fact('Nominator names')).toBe('Shown');
    expect(fact('Individual scores')).toBe('Private');
    await dialog.get('#publish-locks').setValue(true);
    await dialog.get('[data-confirm-publish]').trigger('click');
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
    const button = editor.find('[data-review-publish]');
    expect((button.element as HTMLButtonElement).disabled).toBe(true);
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
    expect(calls.find((call) => call.url.endsWith('/visibility'))?.body).toMatchObject({
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
