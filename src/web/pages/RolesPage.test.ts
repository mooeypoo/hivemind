// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { stubApi } from '../testing/fixtures.ts';
import RolesPage from './RolesPage.vue';

afterEach(() => {
  vi.unstubAllGlobals();
});

const film = { roleId: '900000000000000077', name: 'Film Club' };

describe('RolesPage', () => {
  test('adds a role and saves the table with the version it was loaded at', async () => {
    const calls = stubApi({
      'GET /api/roles': () => Response.json({ labels: [film], version: 'v1' }),
      'PUT /api/roles': (call) => Response.json({ ...(call.body as object), version: 'v2' }),
    });
    const page = mount(RolesPage);
    await flushPromises();
    expect((page.findAll('input')[0]?.element as HTMLInputElement).value).toBe('Film Club');

    await page
      .findAll('button')
      .find((b) => b.text() === 'Add a role')
      ?.trigger('click');
    const inputs = page.findAll('tbody tr')[1]?.findAll('input');
    await inputs?.[0]?.setValue('Moderators');
    await inputs?.[1]?.setValue('900000000000000078');
    await page.get('form').trigger('submit');
    await flushPromises();

    expect(calls.at(-1)?.body).toEqual({
      labels: [film, { name: 'Moderators', roleId: '900000000000000078' }],
      version: 'v1',
    });
    expect(page.text()).toContain('Roles saved.');
  });

  test('catches a role name typed where the ID goes, and explains', async () => {
    stubApi({ 'GET /api/roles': () => Response.json({ labels: [], version: null }) });
    const page = mount(RolesPage);
    await flushPromises();
    await page
      .findAll('button')
      .find((b) => b.text() === 'Add a role')
      ?.trigger('click');
    await page.findAll('tbody input')[1]?.setValue('Moderators');
    expect(page.text()).toContain('“Moderators” isn’t a role ID');
    expect(
      (page.findAll('button').find((b) => b.text() === 'Save')?.element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  test('shows a conflict when someone else saved first', async () => {
    stubApi({
      'GET /api/roles': () => Response.json({ labels: [film], version: 'v1' }),
      'PUT /api/roles': () =>
        Response.json(
          {
            error: {
              code: 'identity.role-labels-changed',
              message: 'Someone else changed the roles meanwhile.',
            },
          },
          { status: 409 },
        ),
    });
    const page = mount(RolesPage);
    await flushPromises();
    await page.get('form').trigger('submit');
    await flushPromises();
    expect(page.get('[role=alert]').text()).toContain('Someone else changed the roles');
  });
});
