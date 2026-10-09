// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubApi } from '../testing/fixtures.ts';
import { api, loginUrl, navigation } from './api.ts';

let assigned: string[];
beforeEach(() => {
  assigned = [];
  vi.spyOn(navigation, 'assign').mockImplementation((url) => {
    assigned.push(url);
  });
  vi.spyOn(navigation, 'currentPath').mockReturnValue('/lists/best?x=1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('API client', () => {
  test('a 401 sends the browser to sign in, and back to this page afterwards', async () => {
    stubApi({
      'GET /api/lists': () =>
        Response.json({ error: { code: 'x', message: 'y' } }, { status: 401 }),
    });
    await api.get('/api/lists');
    expect(assigned).toEqual(['/api/auth/login?returnTo=%2Flists%2Fbest%3Fx%3D1']);
    expect(loginUrl('/a')).toBe('/api/auth/login?returnTo=%2Fa');
  });

  test('the "am I signed in?" check does not redirect', async () => {
    stubApi({ 'GET /api/me': () => Response.json({}, { status: 401 }) });
    const result = await api.get('/api/me', { allowSignedOut: true });
    expect(result.ok).toBe(false);
    expect(assigned).toEqual([]);
  });

  test('passes errors through with their details', async () => {
    stubApi({
      'POST /api/lists': () =>
        Response.json(
          { error: { code: 'lists.invalid-config', message: 'Bad', details: ['title'] } },
          { status: 422 },
        ),
    });
    expect(await api.post('/api/lists', {})).toEqual({
      ok: false,
      error: { status: 422, code: 'lists.invalid-config', message: 'Bad', details: ['title'] },
    });
  });

  test('a network failure is a readable error, not an exception', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    const result = await api.get('/api/lists');
    expect(!result.ok && result.error.code).toBe('http.network');
  });
});
