import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { FixedClock, SequentialIds } from '../../../shared/kernel/testing/index.ts';
import { createApp, type App } from '../../composition.ts';
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
  tmdbReadToken: null,
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
export const startHarness = async (): Promise<Harness> => {
  const directory = await mkdtemp(join(tmpdir(), 'blobs-http-'));
  const server = new BlobsServer({ directory, token: 'test-token' });
  const { port } = await server.start();
  const discord: FakeDiscordState = { member: null };
  const clock = new FixedClock(new Date('2026-01-01T00:00:00Z'));

  const app = createApp(testConfig, {
    clock,
    ids: new SequentialIds(),
    store: (name) =>
      getStore({
        name,
        siteID: 'test-site',
        token: 'test-token',
        edgeURL: `http://localhost:${String(port)}`,
      }),
    fetch: fakeDiscordFetch(discord),
  });

  return {
    app,
    discord,
    clock,
    close: async () => {
      await server.stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
};

export const request = (
  method: string,
  path: string,
  init: { cookies?: Record<string, string>; origin?: string } = {},
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
  return new Request(`${SITE_URL}${path}`, { method, headers });
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
