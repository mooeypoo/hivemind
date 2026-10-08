import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { MeDto, MyDataExportDto } from '../contracts.ts';
import { LOGIN_STATE_COOKIE, SESSION_COOKIE } from '../cookies.ts';
import {
  ADMIN_ROLE_ID,
  cookieValue,
  request,
  setCookies,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { authCallback, authLogin, authLogout } from './auth.ts';
import { deleteMyData, exportMyData, getMe } from './me.ts';

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.discord.member = { id: '80351110224678912', username: 'ada', roles: [ADMIN_ROLE_ID] };
});
afterEach(async () => {
  await h.close();
});

/** Runs the whole sign-in flow and returns the session cookie value. */
const signIn = async (): Promise<string> => {
  const login = await authLogin(request('GET', '/api/auth/login'), h.app);
  const state = cookieValue(setCookies(login)[LOGIN_STATE_COOKIE]);
  const callback = await authCallback(
    request('GET', `/api/auth/callback?code=c&state=${state}`, {
      cookies: { [LOGIN_STATE_COOKIE]: state },
    }),
    h.app,
  );
  return cookieValue(setCookies(callback)[SESSION_COOKIE]);
};

describe('GET /api/auth/login', () => {
  test('redirects to Discord with the minimal scopes and a state cookie', async () => {
    const response = await authLogin(request('GET', '/api/auth/login'), h.app);
    expect(response.status).toBe(302);

    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://discord.com');
    expect(location.searchParams.get('scope')).toBe('identify guilds.members.read');
    expect(location.searchParams.get('redirect_uri')).toBe(`${SITE_URL}/api/auth/callback`);

    const stateCookie = setCookies(response)[LOGIN_STATE_COOKIE];
    expect(stateCookie).toMatch(/; Max-Age=600; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
    expect(cookieValue(stateCookie)).toBe(location.searchParams.get('state'));
  });
});

describe('GET /api/auth/callback', () => {
  test('signs a member in with a 7-day session cookie and returns to the site', async () => {
    const login = await authLogin(request('GET', '/api/auth/login'), h.app);
    const state = cookieValue(setCookies(login)[LOGIN_STATE_COOKIE]);
    const response = await authCallback(
      request('GET', `/api/auth/callback?code=c&state=${state}`, {
        cookies: { [LOGIN_STATE_COOKIE]: state },
      }),
      h.app,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    const cookies = setCookies(response);
    expect(cookies[SESSION_COOKIE]).toMatch(
      /; Max-Age=604800; Path=\/; HttpOnly; Secure; SameSite=Lax$/,
    );
    expect(cookies[LOGIN_STATE_COOKIE]).toContain('Max-Age=0');
  });

  test('rejects a callback whose state does not match the cookie', async () => {
    const response = await authCallback(
      request('GET', '/api/auth/callback?code=c&state=forged', {
        cookies: { [LOGIN_STATE_COOKIE]: 'real' },
      }),
      h.app,
    );
    expect(response.headers.get('location')).toBe('/?login=identity.invalid-login-state');
    expect(setCookies(response)[SESSION_COOKIE]).toBeUndefined();
  });

  test('turns away someone who is not in the Discord server', async () => {
    h.discord.member = null;
    const response = await authCallback(
      request('GET', '/api/auth/callback?code=c&state=s', {
        cookies: { [LOGIN_STATE_COOKIE]: 's' },
      }),
      h.app,
    );
    expect(response.headers.get('location')).toBe('/?login=identity.not-a-member');
    expect(setCookies(response)[SESSION_COOKIE]).toBeUndefined();
  });

  test('treats a callback without a code as a cancelled sign-in', async () => {
    const response = await authCallback(
      request('GET', '/api/auth/callback?error=access_denied&state=s'),
      h.app,
    );
    expect(response.headers.get('location')).toBe('/?login=cancelled');
  });
});

describe('GET /api/me', () => {
  test('is 401 when signed out, and never cached', async () => {
    const response = await getMe(request('GET', '/api/me'), h.app);
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ error: { code: 'auth.sign-in-required' } });
  });

  test('returns the signed-in member with the admin flag', async () => {
    const session = await signIn();
    const response = await getMe(
      request('GET', '/api/me', { cookies: { [SESSION_COOKIE]: session } }),
      h.app,
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as MeDto).toEqual({
      id: '80351110224678912',
      displayName: 'ada',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
      isAdmin: true,
    });
  });

  test('ignores a forged session cookie', async () => {
    const response = await getMe(
      request('GET', '/api/me', { cookies: { [SESSION_COOKIE]: 'forged.token' } }),
      h.app,
    );
    expect(response.status).toBe(401);
  });

  test('ends the session after it expires', async () => {
    const session = await signIn();
    h.clock.advanceSeconds(7 * 24 * 60 * 60);
    const response = await getMe(
      request('GET', '/api/me', { cookies: { [SESSION_COOKIE]: session } }),
      h.app,
    );
    expect(response.status).toBe(401);
  });
});

describe('GET /api/me/export', () => {
  test('downloads everything stored about the member', async () => {
    const session = await signIn();
    const response = await exportMyData(
      request('GET', '/api/me/export', { cookies: { [SESSION_COOKIE]: session } }),
      h.app,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="my-data.json"');
    expect((await response.json()) as MyDataExportDto).toEqual({
      exportedAt: '2026-01-01T00:00:00.000Z',
      identity: {
        id: '80351110224678912',
        displayName: 'ada',
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
      },
    });
  });

  test('is 401 when signed out', async () => {
    expect((await exportMyData(request('GET', '/api/me/export'), h.app)).status).toBe(401);
  });
});

describe('DELETE /api/me', () => {
  test('is refused without the site Origin, and nothing is deleted', async () => {
    const session = await signIn();
    const cookies = { [SESSION_COOKIE]: session };
    for (const origin of [undefined, 'https://evil.example']) {
      const init = origin === undefined ? { cookies } : { cookies, origin };
      expect((await deleteMyData(request('DELETE', '/api/me', init), h.app)).status).toBe(403);
    }
    expect((await getMe(request('GET', '/api/me', { cookies }), h.app)).status).toBe(200);
  });

  test('erases the member, clears the cookie, and ends every session', async () => {
    const session = await signIn();
    const cookies = { [SESSION_COOKIE]: session };
    const response = await deleteMyData(
      request('DELETE', '/api/me', { cookies, origin: SITE_URL }),
      h.app,
    );
    expect(response.status).toBe(204);
    expect(setCookies(response)[SESSION_COOKIE]).toContain('Max-Age=0');
    expect((await getMe(request('GET', '/api/me', { cookies }), h.app)).status).toBe(401);
  });

  test('is 401 when signed out', async () => {
    const response = await deleteMyData(request('DELETE', '/api/me', { origin: SITE_URL }), h.app);
    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the session cookie', async () => {
    const response = await authLogout(
      request('POST', '/api/auth/logout', { origin: SITE_URL }),
      h.app,
    );
    expect(response.status).toBe(204);
    expect(setCookies(response)[SESSION_COOKIE]).toContain('Max-Age=0');
  });

  test('is refused from another origin', async () => {
    const response = await authLogout(
      request('POST', '/api/auth/logout', { origin: 'https://evil.example' }),
      h.app,
    );
    expect(response.status).toBe(403);
  });
});
