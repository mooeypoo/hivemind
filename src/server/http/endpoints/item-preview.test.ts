import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type { CatalogItemDto, ListDto, SearchResultsDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { createList, getList, resolveItemForList, scheduleList, searchForList } from './lists.ts';

type Endpoint = (request: Request, app: App) => Promise<Response>;

let harness: Harness;
let admin: string;
let member: string;

beforeEach(async () => {
  harness = await startHarness();
  admin = await signInAs(harness, { id: SITE_ADMIN_ID, username: 'admin' });
  member = await signInAs(harness, { id: '900000000000000010', username: 'member' });
});

afterEach(async () => harness.close());

const call = async (
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
): Promise<{ status: number; body: unknown }> => {
  const response = await endpoint(
    request(method, path, {
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    harness.app,
  );
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
};

describe('GET /api/lists/:list/item', () => {
  test('resolves full details for one selected movie without nominating it', async () => {
    const created = await call(createList, 'POST', '/api/lists', admin, {
      title: 'Best Sci-Fi Movies',
      slug: 'best-sci-fi',
      itemSource: { kind: 'tmdb-movie' },
    });
    const list = created.body as ListDto;
    await call(scheduleList, 'POST', `/api/lists/${list.id}/schedule`, admin, {
      opensAt: harness.clock.now().toISOString(),
      nominationsCloseAt: null,
      closesAt: null,
    });

    const search = await call(searchForList, 'GET', `/api/lists/${list.id}/search?q=blade`, member);
    const searchItem = (search.body as SearchResultsDto).items[0];
    expect(searchItem?.overview).toBe('A blade runner must pursue replicants.');
    expect(searchItem?.director).toBeUndefined();
    expect(searchItem?.cast).toBeUndefined();

    const preview = await call(
      resolveItemForList,
      'GET',
      `/api/lists/${list.id}/item?externalId=78`,
      member,
    );
    expect(preview.status).toBe(200);
    expect(preview.body as CatalogItemDto).toMatchObject({
      externalId: '78',
      overview: 'A blade runner must pursue replicants.',
      director: 'Ridley Scott',
      cast: ['Harrison Ford', 'Rutger Hauer'],
    });

    const detail = await call(getList, 'GET', `/api/lists/${list.id}`, member);
    expect(detail.status).toBe(200);
    expect((detail.body as { entries: readonly unknown[] }).entries).toHaveLength(0);
  });
});
