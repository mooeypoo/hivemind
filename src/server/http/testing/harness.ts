import { startLocalBlobs } from '../../../shared/infrastructure/testing/local-blobs.ts';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { createApp, type App } from '../../composition.ts';
import { LOGIN_STATE_COOKIE, SESSION_COOKIE } from '../cookies.ts';
import { authCallback, authLogin } from '../endpoints/auth.ts';
import type { AppConfig } from '../../config.ts';

export const SITE_URL = 'https://lists.example.org';
export const GUILD_ID = '900000000000000001';
export const ADMIN_ROLE_ID = '900000000000000002';
/** A member who is an Admin through ADMIN_MEMBER_IDS rather than a role. */
export const SITE_ADMIN_ID = '900000000000000003';

export const testConfig: AppConfig = {
  siteUrl: SITE_URL,
  discord: { clientId: 'client', clientSecret: 'secret', guildId: GUILD_ID },
  admins: { roleId: ADMIN_ROLE_ID, memberIds: [SITE_ADMIN_ID] },
  sessionSecret: 'test-session-secret-at-least-32-chars',
  tmdbReadToken: 'tmdb-test-token',
  community: { inviteCode: null, name: 'Test Community' },
};

/** Discord as the HTTP layer sees it: who is signing in, and whether they are in the server. */
export interface FakeDiscordState {
  member: { id: string; username: string; roles: string[] } | null;
}

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const fakeDiscordFetch =
  (state: FakeDiscordState): typeof fetch =>
  (input) => {
    const path = new URL(urlOf(input)).pathname.replace('/api/v10', '');
    if (path === '/oauth2/token') return Promise.resolve(Response.json({ access_token: 'token' }));
    if (path === '/oauth2/token/revoke')
      return Promise.resolve(new Response(null, { status: 200 }));
    if (path === `/users/@me/guilds/${GUILD_ID}/member`) {
      if (state.member === null) {
        return Promise.resolve(Response.json({ code: 10004 }, { status: 404 }));
      }
      const { id, username, roles } = state.member;
      return Promise.resolve(
        Response.json({ nick: null, avatar: null, roles, user: { id, username, avatar: null } }),
      );
    }
    return Promise.reject(new Error(`Unexpected request to ${path}`));
  };

export interface Harness {
  readonly app: App;
  readonly discord: FakeDiscordState;
  readonly clock: FixedClock;
  close(): Promise<void>;
}

/** A real app over a local Blobs server and a fake Discord. */
export const startHarness = async (
  config: AppConfig = testConfig,
  extraFetch: Partial<Record<string, (url: URL) => Response>> = { 'api.themoviedb.org': fakeTmdb },
): Promise<Harness> => {
  const blobs = await startLocalBlobs();
  const discord: FakeDiscordState = { member: null };
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));
  const discordFetch = fakeDiscordFetch(discord);

  const app = createApp(config, {
    clock,
    ids: new SequentialIds(),
    store: (name) => blobs.store(name),
    fetch: (input, init) => {
      const url = new URL(urlOf(input));
      const handler = extraFetch[url.host];
      return handler === undefined ? discordFetch(input, init) : Promise.resolve(handler(url));
    },
  });

  return { app, discord, clock, close: () => blobs.close() };
};

export const request = (
  method: string,
  path: string,
  init: { cookies?: Record<string, string>; origin?: string; body?: unknown } = {},
): Request => {
  const headers = new Headers();
  if (init.cookies !== undefined) {
    headers.set(
      'cookie',
      Object.entries(init.cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    );
  }
  if (init.origin !== undefined) headers.set('origin', init.origin);
  if (init.body === undefined) return new Request(`${SITE_URL}${path}`, { method, headers });
  headers.set('content-type', 'application/json');
  const body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  return new Request(`${SITE_URL}${path}`, { method, headers, body });
};

/** `Set-Cookie` headers of a response, by cookie name. */
export const setCookies = (response: Response): Record<string, string> =>
  Object.fromEntries(
    response.headers.getSetCookie().map((cookie) => {
      const name = cookie.slice(0, cookie.indexOf('='));
      return [name, cookie];
    }),
  );

export const cookieValue = (setCookie: string | undefined): string =>
  setCookie?.slice(setCookie.indexOf('=') + 1, setCookie.indexOf(';')) ?? '';

/** Runs the whole sign-in flow as this Discord member and returns the session cookie value. */
export const signInAs = async (
  h: Harness,
  member: { id: string; username?: string; roles?: string[] },
): Promise<string> => {
  h.discord.member = {
    id: member.id,
    username: member.username ?? member.id,
    roles: member.roles ?? [],
  };
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

const TMDB_MOVIES: Record<
  string,
  { id: number; title: string; release_date: string; poster_path: string }
> = {
  '78': { id: 78, title: 'Blade Runner', release_date: '1982-06-25', poster_path: '/br.jpg' },
  '335984': {
    id: 335984,
    title: 'Blade Runner 2049',
    release_date: '2017-10-04',
    poster_path: '/br2049.jpg',
  },
};

/** TMDB as tests see it: two movies, found by any part of their title. */
export const fakeTmdb = (url: URL): Response => {
  if (url.pathname === '/3/search/movie') {
    const query = (url.searchParams.get('query') ?? '').toLowerCase();
    return Response.json({
      results: Object.values(TMDB_MOVIES).filter((movie) =>
        movie.title.toLowerCase().includes(query),
      ),
    });
  }
  const movie = TMDB_MOVIES[url.pathname.replace('/3/movie/', '')];
  return movie === undefined ? Response.json({}, { status: 404 }) : Response.json(movie);
};
