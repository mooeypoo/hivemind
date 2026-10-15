import { describe, expect, test, vi } from 'vitest';
import { err } from '../../../shared/kernel/index.ts';
import { catalogErrors } from '../domain/errors.ts';
import { createTvdbSeriesSource } from './tvdb-series-source.ts';

const ref = { kind: 'tvdb-series' } as const;
const series = {
  id: 121361,
  name: 'Game of Thrones',
  year: '2011',
  image: 'https://artworks.thetvdb.com/banners/posters/121361.jpg',
  overview: 'Nine noble families fight for control.',
  characters: [
    { peopleType: 'Creator', personName: 'David Benioff' },
    { peopleType: 'Creator', personName: 'D. B. Weiss' },
    { peopleType: 'Actor', personName: 'Emilia Clarke', sort: 2 },
    { peopleType: 'Actor', personName: 'Peter Dinklage', sort: 1 },
    { peopleType: 'Actor', personName: 'Kit Harington', sort: 3 },
  ],
};

const fakeFetch = (handler: (url: URL) => Response) => {
  return vi.fn<typeof fetch>((input) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    return Promise.resolve(
      url.pathname === '/v4/login'
        ? Response.json({ status: 'success', data: { token: 'access-token' } })
        : handler(url),
    );
  });
};

describe('TVDB series source', () => {
  test('logs in with an API key, searches only series, and reuses the access token', async () => {
    const fetchFn = fakeFetch(() =>
      Response.json({
        status: 'success',
        data: [
          {
            tvdb_id: '121361',
            type: 'series',
            name: series.name,
            year: '2011',
            thumbnail: series.image,
            overview: series.overview,
          },
          { tvdb_id: '2', type: 'movie', name: 'Not a series' },
          { nonsense: true },
        ],
      }),
    );
    const source = createTvdbSeriesSource('api-key', fetchFn);
    const result = await source.search(ref, 'thrones');
    await source.search(ref, 'thrones');

    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ apikey: 'api-key' }),
    });
    const searchInput = fetchFn.mock.calls[1]?.[0];
    if (typeof searchInput !== 'string') throw new Error('Expected a string request URL');
    const searchUrl = new URL(searchInput);
    expect(searchUrl.searchParams.get('type')).toBe('series');
    expect(searchUrl.searchParams.get('query')).toBe('thrones');
    expect(fetchFn.mock.calls[1]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer access-token',
    });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      ok: true,
      value: [
        {
          source: 'tvdb-series',
          externalId: '121361',
          title: series.name,
          subtitle: '2011',
          imageUrl: series.image,
          overview: series.overview,
        },
      ],
    });
  });

  test('resolves fresh extended details, including creators and two actors in credit order', async () => {
    const fetchFn = fakeFetch((url) => {
      expect(url.pathname).toBe('/v4/series/121361/extended');
      return Response.json({ status: 'success', data: series });
    });
    expect(await createTvdbSeriesSource('key', fetchFn).resolve(ref, '121361')).toEqual({
      ok: true,
      value: {
        source: 'tvdb-series',
        externalId: '121361',
        title: series.name,
        subtitle: '2011',
        imageUrl: series.image,
        overview: series.overview,
        creator: 'David Benioff, D. B. Weiss',
        cast: ['Peter Dinklage', 'Emilia Clarke'],
      },
    });
  });

  test('renews the bearer token once after a 401', async () => {
    let attempts = 0;
    const fetchFn = fakeFetch(() =>
      ++attempts === 1
        ? new Response(null, { status: 401 })
        : Response.json({ status: 'success', data: series }),
    );
    expect((await createTvdbSeriesSource('key', fetchFn).resolve(ref, '121361')).ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  test('rejects malformed ids without making a request and handles missing shows', async () => {
    const fetchFn = fakeFetch(() => new Response(null, { status: 404 }));
    const source = createTvdbSeriesSource('key', fetchFn);
    expect(await source.resolve(ref, '../../user')).toEqual(err(catalogErrors.itemNotFound));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await source.resolve(ref, '123')).toEqual(err(catalogErrors.itemNotFound));
  });

  test('uses the highest-scored poster, as search does, over the series image', async () => {
    const top = 'https://artworks.thetvdb.com/banners/v4/series/280619/posters/61acea8cc0aab.jpg';
    const fetchFn = fakeFetch(() =>
      Response.json({
        status: 'success',
        data: {
          id: 280619,
          name: 'The Expanse',
          image: 'https://artworks.thetvdb.com/banners/posters/280619-4.jpg',
          artworks: [
            {
              type: 2,
              score: 100017,
              image: 'https://artworks.thetvdb.com/banners/posters/280619-4.jpg',
            },
            { type: 3, score: 900000, image: 'https://artworks.thetvdb.com/banners/fanart/1.jpg' },
            { type: 2, score: 999999, image: 'https://untrusted.example/poster.jpg' },
            { type: 2, score: 100021, image: top },
          ],
        },
      }),
    );
    const result = await createTvdbSeriesSource('key', fetchFn).resolve(ref, '280619');
    expect(result.ok && result.value.imageUrl).toBe(top);
  });

  test('omits missing credits and images from unapproved hosts', async () => {
    const fetchFn = fakeFetch(() =>
      Response.json({
        status: 'success',
        data: { id: 1, name: 'Show', image: 'https://untrusted.example/poster.jpg' },
      }),
    );
    expect(await createTvdbSeriesSource('key', fetchFn).resolve(ref, '1')).toEqual({
      ok: true,
      value: {
        source: 'tvdb-series',
        externalId: '1',
        title: 'Show',
        subtitle: null,
        imageUrl: null,
      },
    });
  });

  test('reports login, upstream, malformed response and network failures as unavailable', async () => {
    for (const response of [
      new Response(null, { status: 503 }),
      Response.json({ status: 'failure' }),
      Response.json({ status: 'success', data: null }),
    ]) {
      const fetchFn: typeof fetch = () => Promise.resolve(response.clone());
      expect(await createTvdbSeriesSource('key', fetchFn).search(ref, 'x')).toEqual(
        err(catalogErrors.upstreamUnavailable),
      );
    }
    const fetchFn: typeof fetch = () => Promise.reject(new Error('offline'));
    expect(await createTvdbSeriesSource('key', fetchFn).resolve(ref, '1')).toEqual(
      err(catalogErrors.upstreamUnavailable),
    );
  });

  test('handles upstream failures after successful login and bounds 401 retries', async () => {
    for (const response of [
      new Response(null, { status: 429 }),
      new Response(null, { status: 503 }),
      new Response(null, { status: 401 }),
      Response.json({ status: 'success', data: null }),
      new Response('not json'),
    ]) {
      const fetchFn = fakeFetch(() => response.clone());
      expect(await createTvdbSeriesSource('key', fetchFn).search(ref, 'x')).toEqual(
        err(catalogErrors.upstreamUnavailable),
      );
      expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(4);
    }
  });

  test('shares login between concurrent requests and renews before the monthly expiry', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01'));
      const fetchFn = fakeFetch(() => Response.json({ status: 'success', data: [] }));
      const source = createTvdbSeriesSource('key', fetchFn);
      await Promise.all([source.search(ref, 'first'), source.search(ref, 'second')]);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      vi.setSystemTime(new Date('2026-01-30'));
      await source.search(ref, 'third');
      expect(fetchFn).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  test('accepts a pre-issued bearer token without sending it to login', async () => {
    const fetchFn = fakeFetch(() => Response.json({ status: 'success', data: [] }));
    expect(
      (await createTvdbSeriesSource('header.payload.signature', fetchFn).search(ref, 'show')).ok,
    ).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer header.payload.signature',
    });
  });
});
