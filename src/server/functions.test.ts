import { afterEach, describe, expect, test, vi } from 'vitest';
import { getApp } from './composition.ts';
import { authCallback, authLogin, handle } from './functions.ts';

vi.mock('./composition.ts', () => ({ getApp: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('unexpected function errors', () => {
  test.each([
    ['login', authLogin],
    ['callback', authCallback],
  ] as const)(
    'returns %s initialization failures to the site without exposing details',
    async (path, endpoint) => {
      vi.mocked(getApp).mockImplementation(() => {
        throw new Error('Invalid configuration: SITE_URL is not set');
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const response = await handle(endpoint)(new Request(`https://site.example/api/auth/${path}`));

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/?login=http.internal');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.getSetCookie()).toEqual(
        expect.arrayContaining([
          expect.stringContaining('__Host-login_state=; Max-Age=0'),
          expect.stringContaining('__Host-login_return=; Max-Age=0'),
        ]),
      );
      expect(await response.text()).not.toContain('Invalid configuration');
      expect(log).toHaveBeenCalledWith(expect.stringContaining('SITE_URL is not set'));
    },
  );

  test('keeps JSON errors for ordinary API endpoints', async () => {
    vi.mocked(getApp).mockImplementation(() => {
      throw new Error('Unavailable');
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const endpoint = vi.fn();

    const response = await handle(endpoint)(new Request('https://site.example/api/lists'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'http.internal', message: 'Something went wrong.' },
    });
    expect(endpoint).not.toHaveBeenCalled();
  });

  test('also returns failures after initialization to the site', async () => {
    vi.mocked(getApp).mockReturnValue({
      identity: {
        startLogin: () => {
          throw new Error('Unable to generate state');
        },
      },
    } as unknown as ReturnType<typeof getApp>);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handle(authLogin)(
      new Request('https://site.example/api/auth/login?returnTo=https://evil.example'),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/?login=http.internal');
  });
});
