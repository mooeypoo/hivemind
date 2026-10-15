import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { ItemSource } from '../application/ports.ts';
import type { CatalogItem } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';

const API = 'https://api4.thetvdb.com/v4';
const MAX_RESULTS = 20;
const TOKEN_TTL = 28 * 24 * 60 * 60 * 1000;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const imageUrl = (value: unknown): string | null => {
  try {
    const url = new URL(text(value), 'https://artworks.thetvdb.com/banners/');
    return text(value) !== '' &&
      url.protocol === 'https:' &&
      url.hostname === 'artworks.thetvdb.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === ''
      ? url.href
      : null;
  } catch {
    return null;
  }
};

const SERIES_POSTER = 2;

// Search shows the highest-scored poster; a series' `image` can be an older one.
const topPoster = (artworks: unknown): string | null => {
  if (!Array.isArray(artworks)) return null;
  const posters = artworks
    .map(record)
    .filter((artwork) => artwork.type === SERIES_POSTER && imageUrl(artwork.image) !== null)
    .sort(
      (first, second) =>
        (typeof second.score === 'number' ? second.score : 0) -
        (typeof first.score === 'number' ? first.score : 0),
    );
  return posters[0] === undefined ? null : imageUrl(posters[0].image);
};

const toItem = (value: unknown, extended: boolean): CatalogItem | null => {
  const show = record(value);
  const externalId = String(extended ? show.id : show.tvdb_id);
  const title = text(show.name);
  if (!/^\d{1,12}$/.test(externalId) || title === '') return null;
  if (!extended && show.type !== 'series') return null;
  const translations = record(show.translations);
  const overviews = record(show.overviews);
  const overview = text(overviews.eng) || text(show.overview);
  const characters = Array.isArray(show.characters) ? show.characters.map(record) : [];
  const creator = [
    ...new Set(
      characters
        .filter((person) => text(person.peopleType).toLowerCase() === 'creator')
        .map((person) => text(person.personName))
        .filter(Boolean),
    ),
  ].join(', ');
  const cast = [
    ...new Set(
      characters
        .filter((person) => text(person.peopleType).toLowerCase() === 'actor')
        .sort(
          (first, second) =>
            (typeof first.sort === 'number' ? first.sort : 0) -
            (typeof second.sort === 'number' ? second.sort : 0),
        )
        .map((person) => text(person.personName))
        .filter(Boolean),
    ),
  ].slice(0, 2);
  const year = text(show.year) || text(show.firstAired);
  return {
    source: 'tvdb-series',
    externalId,
    title: extended ? title : text(translations.eng) || title,
    subtitle: /^\d{4}/.test(year) ? year.slice(0, 4) : null,
    imageUrl: extended
      ? (topPoster(show.artworks) ?? imageUrl(show.image))
      : (imageUrl(show.thumbnail) ?? imageUrl(show.image_url)),
    ...(overview === '' ? {} : { overview }),
    ...(creator === '' ? {} : { creator }),
    ...(cast.length === 0 ? {} : { cast }),
  };
};

export const createTvdbSeriesSource = (
  readToken: string,
  fetchFn: typeof fetch = fetch,
): ItemSource => {
  const bearerOnly = readToken.split('.').length === 3;
  let accessToken: string | null = bearerOnly ? readToken : null;
  let expiresAt = 0;
  let loginInFlight: Promise<string> | null = null;

  const login = async (): Promise<string> => {
    const response = await fetchFn(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apikey: readToken }),
    });
    if (!response.ok) throw new Error('TVDB authentication unavailable');
    const body: unknown = await response.json();
    const token = text(record(record(body).data).token);
    if (record(body).status !== 'success' || token === '')
      throw new Error('TVDB authentication unavailable');
    accessToken = token;
    expiresAt = Date.now() + TOKEN_TTL;
    return token;
  };

  const token = async (): Promise<string> => {
    if (accessToken !== null && (bearerOnly || Date.now() < expiresAt)) return accessToken;
    loginInFlight ??= login().finally(() => {
      loginInFlight = null;
    });
    return loginInFlight;
  };

  const get = async (path: string, params: Record<string, string> = {}): Promise<Response> => {
    const request = async () =>
      fetchFn(`${API}${path}?${new URLSearchParams(params).toString()}`, {
        headers: { Authorization: `Bearer ${await token()}`, Accept: 'application/json' },
      });
    const response = await request();
    if (response.status !== 401 || bearerOnly) return response;
    accessToken = null;
    return request();
  };

  return {
    async search(_ref, query): Promise<Result<readonly CatalogItem[], DomainError>> {
      try {
        const response = await get('/search', {
          query,
          type: 'series',
          limit: String(MAX_RESULTS),
        });
        if (!response.ok) return err(catalogErrors.upstreamUnavailable);
        const body = record(await response.json());
        if (body.status !== 'success' || !Array.isArray(body.data))
          return err(catalogErrors.upstreamUnavailable);
        return ok(
          body.data
            .map((show) => toItem(show, false))
            .filter((item): item is CatalogItem => item !== null)
            .slice(0, MAX_RESULTS),
        );
      } catch {
        return err(catalogErrors.upstreamUnavailable);
      }
    },
    async resolve(_ref, externalId): Promise<Result<CatalogItem, DomainError>> {
      if (!/^\d{1,12}$/.test(externalId)) return err(catalogErrors.itemNotFound);
      try {
        const response = await get(`/series/${externalId}/extended`);
        if (response.status === 404) return err(catalogErrors.itemNotFound);
        if (!response.ok) return err(catalogErrors.upstreamUnavailable);
        const body = record(await response.json());
        if (body.status !== 'success') return err(catalogErrors.upstreamUnavailable);
        const item = toItem(body.data, true);
        return item?.externalId !== externalId ? err(catalogErrors.itemNotFound) : ok(item);
      } catch {
        return err(catalogErrors.upstreamUnavailable);
      }
    },
  };
};
