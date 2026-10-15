import { err, ok, type DomainError, type Result } from '../../../shared/kernel/index.ts';
import type { ItemSource } from '../application/ports.ts';
import type { CatalogItem } from '../domain/catalog-item.ts';
import { catalogErrors } from '../domain/errors.ts';

const API = 'https://api.igdb.com/v4/games';
const FIELDS =
  'fields name,first_release_date,cover.image_id,summary,involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';
const MAX_RESULTS = 20;
const ID = /^[1-9]\d{0,11}$/;

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toItem = (value: unknown): CatalogItem | null => {
  const game = record(value);
  const externalId = String(game.id);
  const title = text(game.name);
  if (!ID.test(externalId) || title === '') return null;
  const imageId = text(record(game.cover).image_id);
  const overview = text(game.summary);
  const companies = Array.isArray(game.involved_companies)
    ? game.involved_companies.map(record)
    : [];
  const companyNames = (role: 'developer' | 'publisher'): string =>
    [
      ...new Set(
        companies
          .filter((company) => company[role] === true)
          .map((company) => text(record(company.company).name))
          .filter(Boolean),
      ),
    ].join(', ');
  const developer = companyNames('developer');
  const publisher = companyNames('publisher');
  const released =
    typeof game.first_release_date === 'number' && Number.isFinite(game.first_release_date)
      ? new Date(game.first_release_date * 1000)
      : null;
  return {
    source: 'igdb-game',
    externalId,
    title,
    subtitle:
      released !== null && !Number.isNaN(released.getTime())
        ? String(released.getUTCFullYear())
        : null,
    imageUrl: /^[A-Za-z0-9_-]+$/.test(imageId)
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`
      : null,
    ...(overview === '' ? {} : { overview }),
    ...(developer === '' ? {} : { developer }),
    ...(publisher === '' ? {} : { publisher }),
  };
};

export const createIgdbGameSource = (
  credentials: { readonly clientId: string; readonly clientSecret: string },
  fetchFn: typeof fetch = fetch,
): ItemSource => {
  let accessToken: string | null = null;
  let expiresAt = 0;
  let loginInFlight: Promise<string> | null = null;
  let queue: Promise<void> = Promise.resolve();
  let nextRequestAt = 0;

  const login = async (): Promise<string> => {
    const response = await fetchFn('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('IGDB authentication unavailable');
    const body = record(await response.json());
    const token = text(body.access_token);
    if (
      token === '' ||
      body.token_type !== 'bearer' ||
      typeof body.expires_in !== 'number' ||
      !Number.isFinite(body.expires_in) ||
      body.expires_in <= 60
    )
      throw new Error('IGDB authentication unavailable');
    accessToken = token;
    expiresAt = Date.now() + (body.expires_in - 60) * 1000;
    return token;
  };

  const token = async (): Promise<string> => {
    if (accessToken !== null && Date.now() < expiresAt) return accessToken;
    loginInFlight ??= login().finally(() => {
      loginInFlight = null;
    });
    return loginInFlight;
  };

  // Pace this warm instance; IGDB's credential-wide limit still applies across instances.
  const request = (query: string, bearer: string): Promise<Response> => {
    const pending = queue.then(async () => {
      const wait = nextRequestAt - Date.now();
      if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      nextRequestAt = Date.now() + 250;
      return fetchFn(API, {
        method: 'POST',
        headers: {
          'Client-ID': credentials.clientId,
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'text/plain',
          Accept: 'application/json',
        },
        body: `${FIELDS} ${query}`,
        signal: AbortSignal.timeout(10_000),
      });
    });
    queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  };

  const games = async (query: string): Promise<Result<readonly CatalogItem[], DomainError>> => {
    try {
      const bearer = await token();
      let response = await request(query, bearer);
      if (response.status === 401) {
        if (accessToken === bearer) accessToken = null;
        response = await request(query, await token());
      }
      if (!response.ok) return err(catalogErrors.upstreamUnavailable);
      const body: unknown = await response.json();
      if (!Array.isArray(body)) return err(catalogErrors.upstreamUnavailable);
      const items = body.map(toItem);
      if (items.some((item) => item === null)) return err(catalogErrors.upstreamUnavailable);
      return ok(items.filter((item): item is CatalogItem => item !== null).slice(0, MAX_RESULTS));
    } catch {
      return err(catalogErrors.upstreamUnavailable);
    }
  };

  return {
    search: (_ref, query) =>
      games(`search ${JSON.stringify(query)}; limit ${String(MAX_RESULTS)};`),
    async resolve(_ref, externalId) {
      if (!ID.test(externalId)) return err(catalogErrors.itemNotFound);
      const result = await games(`where id = ${externalId}; limit 1;`);
      if (!result.ok) return result;
      const item = result.value[0];
      return item?.externalId === externalId ? ok(item) : err(catalogErrors.itemNotFound);
    },
  };
};
