import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ErrorDto, RoleLabelsDto, SiteDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  testConfig,
  type Harness,
} from '../testing/harness.ts';
import { getRoleLabels, getSite, saveRoleLabels } from './site.ts';

let h: Harness;
afterEach(async () => {
  await h.close();
});

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- names the expected body type
const read = async <T>(response: Response) => ({
  status: response.status,
  body: (await response.json()) as T,
});

describe('GET /api/site', () => {
  test('is public and says which community this is', async () => {
    h = await startHarness();
    const result = await read<SiteDto>(await getSite(request('GET', '/api/site'), h.app));
    expect(result).toEqual({
      status: 200,
      body: {
        community: { name: 'Test Community', iconUrl: null, inviteUrl: null },
        offersMovieData: true,
        offersTvData: false,
        offersGameData: false,
        demo: false,
        backups: true,
      },
    });
  });

  test('uses the invite to show the server name and icon', async () => {
    h = await startHarness(
      { ...testConfig, community: { inviteCode: 'filmclub', name: null } },
      {
        'discord.com': (url) =>
          url.pathname === '/api/v10/invites/filmclub'
            ? Response.json({
                guild: { id: testConfig.discord.guildId, name: 'Film Club', icon: 'abc' },
              })
            : new Response(null, { status: 404 }),
      },
    );
    const result = await read<SiteDto>(await getSite(request('GET', '/api/site'), h.app));
    expect(result.body.community).toEqual({
      name: 'Film Club',
      iconUrl: `https://cdn.discordapp.com/icons/${testConfig.discord.guildId}/abc.png?size=64`,
      inviteUrl: 'https://discord.gg/filmclub',
    });
  });

  test('without TMDB, does not mention movie data', async () => {
    h = await startHarness({ ...testConfig, tmdbReadToken: null });
    const result = await read<SiteDto>(await getSite(request('GET', '/api/site'), h.app));
    expect(result.body.offersMovieData).toBe(false);
  });

  test('reports TVDB independently without exposing credentials', async () => {
    h = await startHarness({ ...testConfig, tmdbReadToken: null, tvdbReadToken: 'secret-tv-key' });
    const result = await read<SiteDto>(await getSite(request('GET', '/api/site'), h.app));
    expect(result.body.offersTvData).toBe(true);
    expect(result.body.offersMovieData).toBe(false);
    expect(JSON.stringify(result.body)).not.toContain('secret-tv-key');
  });

  test('reports IGDB independently and never exposes application credentials', async () => {
    h = await startHarness({
      ...testConfig,
      tmdbReadToken: null,
      igdb: { clientId: 'game-client', clientSecret: 'game-secret' },
    });
    const result = await read<SiteDto>(await getSite(request('GET', '/api/site'), h.app));
    expect(result.body.offersGameData).toBe(true);
    expect(result.body.offersMovieData).toBe(false);
    expect(result.body.offersTvData).toBe(false);
    expect(JSON.stringify(result.body)).not.toMatch(/game-client|game-secret/);
  });
});

describe('/api/roles', () => {
  let admin: string;
  let ada: string;
  beforeEach(async () => {
    h = await startHarness();
    admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
    ada = await signInAs(h, { id: '900000000000000010', username: 'ada' });
  });

  const save = (session: string, body: unknown) =>
    saveRoleLabels(
      request('PUT', '/api/roles', {
        cookies: { [SESSION_COOKIE]: session },
        origin: SITE_URL,
        body,
      }),
      h.app,
    );

  test('an Admin names roles; members read the names', async () => {
    const saved = await read<RoleLabelsDto>(
      await save(admin, {
        labels: [{ roleId: '900000000000000077', name: 'Film Club' }],
        version: null,
      }),
    );
    expect(saved.body.labels).toEqual([{ roleId: '900000000000000077', name: 'Film Club' }]);
    const read2 = await read<RoleLabelsDto>(
      await getRoleLabels(
        request('GET', '/api/roles', { cookies: { [SESSION_COOKIE]: ada } }),
        h.app,
      ),
    );
    expect(read2.body.labels).toEqual(saved.body.labels);
    expect(read2.body.version).toBe(saved.body.version);
  });

  test('members cannot save; a stale version is refused', async () => {
    expect((await save(ada, { labels: [], version: null })).status).toBe(403);
    const first = await read<RoleLabelsDto>(await save(admin, { labels: [], version: null }));
    await save(admin, { labels: [], version: first.body.version });
    const stale = await read<ErrorDto>(
      await save(admin, { labels: [], version: first.body.version }),
    );
    expect(stale.status).toBe(409);
  });
});
