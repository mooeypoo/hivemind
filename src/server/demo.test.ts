import { afterEach, describe, expect, test } from 'vitest';
import type { DeployContext } from './deploy-context.ts';
import type { ErrorDto, LeaderboardDto, ListsDto, MeDto, SiteDto } from './http/contracts.ts';
import { SESSION_COOKIE } from './http/cookies.ts';
import { demoSignIn } from './http/endpoints/auth.ts';
import { listLists } from './http/endpoints/lists.ts';
import { getMe } from './http/endpoints/me.ts';
import { getLeaderboard } from './http/endpoints/ranking.ts';
import { getSite } from './http/endpoints/site.ts';
import {
  cookieValue,
  request,
  setCookies,
  startHarness,
  testConfig,
  type Harness,
} from './http/testing/harness.ts';

let h: Harness;
afterEach(async () => {
  await h.close();
});

const PREVIEW = 'https://deploy-preview-7--lists.netlify.app';

const start = async (demoRequested: boolean, context: DeployContext) => {
  h = await startHarness({ ...testConfig, demoRequested }, undefined, context);
  h.clock.set(new Date());
};

/** A demo sign-in to the preview, claiming to come from `origin`. */
const demoSignInAs = async (persona: string, origin = PREVIEW, host = origin) =>
  demoSignIn(
    new Request(`${host}/api/auth/demo`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ persona }),
    }),
    h.app,
  );

describe('demo mode has two locks', () => {
  test.each([
    ['DEMO_MODE unset, in a preview', false, 'deploy-preview'],
    ['DEMO_MODE set, but in production', true, 'production'],
  ] as const)('off: %s', async (_, requested, context) => {
    await start(requested, context);
    expect(h.app.demo).toBe(false);
    const origin = context === 'production' ? testConfig.siteUrl : PREVIEW;
    const response = await demoSignInAs('admin', origin);
    expect(response.status).toBe(403);
    expect(((await response.json()) as ErrorDto).error.code).toBe('identity.demo-off');
    const site = (await (await getSite(request('GET', '/api/site'), h.app)).json()) as SiteDto;
    expect(site.demo).toBe(false);
  });

  test.each(['deploy-preview', 'branch-deploy', 'dev'] as const)(
    'on: DEMO_MODE set, in %s',
    async (context) => {
      await start(true, context);
      expect(h.app.demo).toBe(true);
    },
  );
});

describe('outside production', () => {
  test('mutations must come from the deploy’s own origin', async () => {
    await start(true, 'deploy-preview');
    expect((await demoSignInAs('member-a', PREVIEW)).status).toBe(204);
    expect((await demoSignInAs('member-a', 'https://evil.example', PREVIEW)).status).toBe(403);
  });

  test('production still demands exactly SITE_URL', async () => {
    await start(false, 'production');
    const sameHostWrongSite = new Request(`${PREVIEW}/api/auth/demo`, {
      method: 'POST',
      headers: { origin: PREVIEW, 'content-type': 'application/json' },
      body: '{"persona":"admin"}',
    });
    expect((await demoSignIn(sameHostWrongSite, h.app)).status).toBe(403);
  });
});

describe('demo sign-in', () => {
  const session = async (persona: string) =>
    cookieValue(setCookies(await demoSignInAs(persona))[SESSION_COOKIE]);
  const get = async <T>(
    endpoint: (r: Request, app: typeof h.app) => Promise<Response>,
    path: string,
    token: string,
  ) =>
    (await (
      await endpoint(
        new Request(`${PREVIEW}${path}`, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }),
        h.app,
      )
    ).json()) as T;

  test('signs in as each persona; Demo Admin is an Admin', async () => {
    await start(true, 'deploy-preview');
    expect((await get<MeDto>(getMe, '/api/me', await session('admin'))).isAdmin).toBe(true);
    expect(await get<MeDto>(getMe, '/api/me', await session('member-b'))).toMatchObject({
      displayName: 'Demo Member B',
      isAdmin: false,
    });
  });

  test('creates the sample lists once, with a meaningful leaderboard', async () => {
    await start(true, 'deploy-preview');
    const token = await session('member-a');
    await session('member-b');
    const lists = await get<ListsDto>(listLists, '/api/lists', token);
    expect(lists.lists.map((list) => list.slug).sort()).toEqual([
      'demo-albums',
      'demo-board-games',
      'demo-sci-fi',
    ]);

    const board = await get<LeaderboardDto>(
      getLeaderboard,
      '/api/lists/demo-board-games/leaderboard',
      token,
    );
    if (board.hidden) throw new Error('expected a visible board');
    expect(board.rows[0]?.item.title).toBe('Root');
    expect(board.rows.some((row) => row.provisional)).toBe(true);

    const albums = await get<LeaderboardDto>(
      getLeaderboard,
      '/api/lists/demo-albums/leaderboard',
      token,
    );
    expect(albums.hidden).toBe(true);
  });

  test('unknown personas are refused', async () => {
    await start(true, 'dev');
    expect((await demoSignInAs('root')).status).toBe(422);
  });
});
