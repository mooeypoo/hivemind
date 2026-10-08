import { describe, expect, test } from 'vitest';
import { err } from '../../../shared/kernel/index.ts';
import { catalogErrors } from '../domain/errors.ts';
import { createTmdbMovieSource } from './tmdb-movie-source.ts';

const ref = { kind: 'tmdb-movie' } as const;

const fakeFetch = (handler: (url: URL, init: RequestInit | undefined) => Response) => {
  const urls: URL[] = [];
  const headers: RequestInit['headers'][] = [];
  const fetchFn: typeof fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    urls.push(url);
    headers.push(init?.headers);
    return Promise.resolve(handler(url, init));
  };
  return { fetchFn, urls, headers };
};

const bladeRunner = {
  id: 78,
  title: 'Blade Runner',
  release_date: '1982-06-25',
  poster_path: '/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg',
  adult: false,
};

describe('TMDB movie source', () => {
  test('searches without adult titles, with the read token, and maps results', async () => {
    const { fetchFn, urls, headers } = fakeFetch(() =>
      Response.json({
        results: [
          bladeRunner,
          { id: 2, title: 'Adult', adult: true },
          { id: 3, title: 'No Date', release_date: '', poster_path: null },
          { nonsense: true },
        ],
      }),
    );
    const result = await createTmdbMovieSource('read-token', fetchFn).search(ref, 'blade runner');

    expect(urls[0]?.pathname).toBe('/3/search/movie');
    expect(urls[0]?.searchParams.get('query')).toBe('blade runner');
    expect(urls[0]?.searchParams.get('include_adult')).toBe('false');
    expect(headers[0]).toMatchObject({ Authorization: 'Bearer read-token' });
    expect(result).toEqual({
      ok: true,
      value: [
        {
          source: 'tmdb-movie',
          externalId: '78',
          title: 'Blade Runner',
          subtitle: '1982',
          imageUrl: 'https://image.tmdb.org/t/p/w342/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg',
        },
        { source: 'tmdb-movie', externalId: '3', title: 'No Date', subtitle: null, imageUrl: null },
      ],
    });
  });

  test('resolves a movie by id, so a nomination is validated against TMDB', async () => {
    const { fetchFn, urls } = fakeFetch(() => Response.json(bladeRunner));
    const result = await createTmdbMovieSource('t', fetchFn).resolve(ref, '78');
    expect(urls[0]?.pathname).toBe('/3/movie/78');
    expect(result.ok && result.value.title).toBe('Blade Runner');
  });

  test('treats an unknown id, a non-numeric id, or an adult title as not found', async () => {
    const missing = fakeFetch(() => Response.json({ status_code: 34 }, { status: 404 }));
    expect(await createTmdbMovieSource('t', missing.fetchFn).resolve(ref, '999')).toEqual(
      err(catalogErrors.itemNotFound),
    );

    const never = fakeFetch(() => {
      throw new Error('should not be called');
    });
    expect(await createTmdbMovieSource('t', never.fetchFn).resolve(ref, '../../account')).toEqual(
      err(catalogErrors.itemNotFound),
    );

    const adult = fakeFetch(() => Response.json({ ...bladeRunner, adult: true }));
    expect(await createTmdbMovieSource('t', adult.fetchFn).resolve(ref, '78')).toEqual(
      err(catalogErrors.itemNotFound),
    );
  });

  test('reports TMDB errors and network failures as unavailable', async () => {
    const down = fakeFetch(() => new Response(null, { status: 503 }));
    expect(await createTmdbMovieSource('t', down.fetchFn).search(ref, 'x')).toEqual(
      err(catalogErrors.upstreamUnavailable),
    );
    const broken: typeof fetch = () => Promise.reject(new Error('offline'));
    expect(await createTmdbMovieSource('t', broken).resolve(ref, '78')).toEqual(
      err(catalogErrors.upstreamUnavailable),
    );
  });
});
