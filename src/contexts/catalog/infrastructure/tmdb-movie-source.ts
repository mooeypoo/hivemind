import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { ItemSource } from '../application/ports.ts';
import type { CatalogItem } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';

const API = 'https://api.themoviedb.org/3';
/** Must stay in the CSP `img-src` (netlify.toml). */
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const MAX_RESULTS = 20;

interface TmdbMovie {
  readonly id: number;
  readonly title: string;
  readonly release_date?: string;
  readonly poster_path?: string | null;
  readonly adult?: boolean;
}

const isMovie = (value: unknown): value is TmdbMovie => {
  if (typeof value !== 'object' || value === null) return false;
  const movie = value as Record<string, unknown>;
  return typeof movie.id === 'number' && typeof movie.title === 'string';
};

const toItem = (movie: TmdbMovie): CatalogItem => ({
  source: 'tmdb-movie',
  externalId: String(movie.id),
  title: movie.title,
  subtitle: /^\d{4}/.test(movie.release_date ?? '') ? (movie.release_date ?? '').slice(0, 4) : null,
  imageUrl:
    typeof movie.poster_path === 'string' && movie.poster_path.startsWith('/')
      ? `${IMAGE_BASE}${movie.poster_path}`
      : null,
});

/** Movies from The Movie Database. Adult titles are never returned. */
export const createTmdbMovieSource = (
  readToken: string,
  fetchFn: typeof fetch = fetch,
): ItemSource => {
  const get = async (path: string, params: Record<string, string> = {}): Promise<Response> =>
    fetchFn(`${API}${path}?${new URLSearchParams(params).toString()}`, {
      headers: { Authorization: `Bearer ${readToken}`, Accept: 'application/json' },
    });

  return {
    async search(_ref, query): Promise<Result<readonly CatalogItem[], DomainError>> {
      try {
        const response = await get('/search/movie', {
          query,
          include_adult: 'false',
          page: '1',
        });
        if (!response.ok) return err(catalogErrors.upstreamUnavailable);
        const body = (await response.json()) as { results?: unknown };
        const results = Array.isArray(body.results) ? body.results : [];
        return ok(
          results
            .filter(isMovie)
            .filter((movie) => movie.adult !== true)
            .slice(0, MAX_RESULTS)
            .map(toItem),
        );
      } catch {
        return err(catalogErrors.upstreamUnavailable);
      }
    },

    async resolve(_ref, externalId): Promise<Result<CatalogItem, DomainError>> {
      if (!/^\d{1,12}$/.test(externalId)) return err(catalogErrors.itemNotFound);
      try {
        const response = await get(`/movie/${externalId}`);
        if (response.status === 404) return err(catalogErrors.itemNotFound);
        if (!response.ok) return err(catalogErrors.upstreamUnavailable);
        const movie: unknown = await response.json();
        if (!isMovie(movie) || movie.adult === true) return err(catalogErrors.itemNotFound);
        return ok(toItem(movie));
      } catch {
        return err(catalogErrors.upstreamUnavailable);
      }
    },
  };
};
