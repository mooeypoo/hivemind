import { describe, expect, test, vi } from 'vitest';
import { err } from '../../../shared/kernel/index.ts';
import { catalogErrors } from '../domain/errors.ts';
import { createIgdbGameSource } from './igdb-game-source.ts';

const ref = { kind: 'igdb-game' } as const;
const game = {
  id: 1942,
  name: 'The Witcher 3',
  first_release_date: 1431993600,
  summary: 'A monster hunter searches for his adopted daughter.',
  cover: { image_id: 'co1wyy' },
  involved_companies: [
    { developer: true, company: { name: 'CD Projekt RED' } },
    { developer: true, company: { name: 'CD Projekt RED' } },
    { publisher: true, company: { name: 'CD Projekt' } },
  ],
};
const item = {
  source: 'igdb-game',
  externalId: '1942',
  title: game.name,
  subtitle: '2015',
  imageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1wyy.jpg',
  overview: game.summary,
  developer: 'CD Projekt RED',
  publisher: 'CD Projekt',
};
const fakeFetch = (reply: () => Response = () => Response.json([game])) =>
  vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      (input instanceof Request ? input.url : input.toString()).includes('id.twitch.tv')
        ? Response.json({ access_token: 'access-token', expires_in: 3600, token_type: 'bearer' })
        : reply(),
    ),
  );

describe('IGDB game source', () => {
  test('authenticates server-side and returns full search metadata with deduplicated companies', async () => {
    const fetchFn = fakeFetch();
    const source = createIgdbGameSource({ clientId: 'client', clientSecret: 'secret' }, fetchFn);
    expect(await source.search(ref, 'witcher')).toEqual({ ok: true, value: [item] });
    expect(await source.resolve(ref, '1942')).toEqual({ ok: true, value: item });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const login = fetchFn.mock.calls[0];
    expect(login?.[0]).toBe('https://id.twitch.tv/oauth2/token');
    const loginBody = login?.[1]?.body;
    if (typeof loginBody !== 'string') throw new Error('Expected a form-encoded login body');
    expect(new URLSearchParams(loginBody).get('client_secret')).toBe('secret');
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Client-ID': 'client', Authorization: 'Bearer access-token' },
    });
    expect(fetchFn.mock.calls[1]?.[1]?.body).toContain('search "witcher";');
    expect(fetchFn.mock.calls[2]?.[1]?.body).toContain('where id = 1942;');
  });

  test('escapes search strings so they cannot inject query clauses', async () => {
    const fetchFn = fakeFetch();
    const query = 'a"; where id > 0; \\';
    await createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn).search(
      ref,
      query,
    );
    expect(fetchFn.mock.calls[1]?.[1]?.body).toContain(`search ${JSON.stringify(query)};`);
  });

  test('rejects invalid ids without upstream requests and verifies returned identity', async () => {
    const fetchFn = fakeFetch();
    const source = createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn);
    for (const id of ['../../user', '1; limit 500', '0', '01', '-1']) {
      expect(await source.resolve(ref, id)).toEqual(err(catalogErrors.itemNotFound));
    }
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await source.resolve(ref, '99')).toEqual(err(catalogErrors.itemNotFound));
  });

  test('handles missing games and optional metadata without inventing details', async () => {
    const fetchFn = fakeFetch(() => Response.json([{ id: 1, name: 'Game' }]));
    expect(
      await createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn).resolve(
        ref,
        '1',
      ),
    ).toEqual({
      ok: true,
      value: {
        source: 'igdb-game',
        externalId: '1',
        title: 'Game',
        subtitle: null,
        imageUrl: null,
      },
    });
    const missing = fakeFetch(() => Response.json([]));
    expect(
      await createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, missing).resolve(
        ref,
        '1',
      ),
    ).toEqual(err(catalogErrors.itemNotFound));
  });

  test('never uses arbitrary upstream image addresses or unsafe image ids', async () => {
    const fetchFn = fakeFetch(() =>
      Response.json([{ ...game, cover: { image_id: '../evil', url: 'https://evil.test/a.jpg' } }]),
    );
    const result = await createIgdbGameSource(
      { clientId: 'id', clientSecret: 'secret' },
      fetchFn,
    ).resolve(ref, '1942');
    expect(result.ok && result.value.imageUrl).toBeNull();
  });

  test('renews once on 401 and shares authentication between concurrent requests', async () => {
    let requests = 0;
    const fetchFn = fakeFetch(() =>
      ++requests === 1 ? new Response(null, { status: 401 }) : Response.json([game]),
    );
    const source = createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn);
    expect((await source.resolve(ref, '1942')).ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    const concurrent = fakeFetch();
    const shared = createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, concurrent);
    await Promise.all([shared.search(ref, 'a'), shared.search(ref, 'b')]);
    expect(concurrent).toHaveBeenCalledTimes(3);
  });

  test('renews before token expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const fetchFn = fakeFetch();
      const source = createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn);
      await source.search(ref, 'a');
      now.mockReturnValue(3_600_000);
      await source.search(ref, 'b');
      expect(fetchFn).toHaveBeenCalledTimes(4);
    } finally {
      now.mockRestore();
    }
  });

  test('paces concurrent API requests at no more than four starts per second', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const starts: number[] = [];
      const fetchFn = fakeFetch(() => {
        starts.push(Date.now());
        return Response.json([game]);
      });
      const source = createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn);
      const pending = Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((query) => source.search(ref, query)),
      );
      await vi.runAllTimersAsync();
      expect((await pending).every((result) => result.ok)).toBe(true);
      expect(starts).toEqual([0, 250, 500, 750, 1000]);
      expect(fetchFn).toHaveBeenCalledTimes(6);
    } finally {
      vi.useRealTimers();
    }
  });

  test('surfaces upstream, malformed JSON, authentication and network errors as unavailable', async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 401 }),
      Response.json({ error: 'invalid' }),
      new Response('not json'),
    ]) {
      const fetchFn = fakeFetch(() => response.clone());
      expect(
        await createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn).search(
          ref,
          'x',
        ),
      ).toEqual(err(catalogErrors.upstreamUnavailable));
      expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(4);
    }
    for (const fetchFn of [
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ access_token: 'invalid' }))),
      vi.fn<typeof fetch>(() => Promise.reject(new Error('offline'))),
    ]) {
      expect(
        await createIgdbGameSource({ clientId: 'id', clientSecret: 'secret' }, fetchFn).search(
          ref,
          'x',
        ),
      ).toEqual(err(catalogErrors.upstreamUnavailable));
    }
  });
});
