import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type { EntryDto, ListDto, RefreshMovieDetailsDto } from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import { createList, nominate, refreshMovieDetails, scheduleList } from './lists.ts';

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
  session: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> => {
  const response = await endpoint(
    request(method, path, {
      cookies: { [SESSION_COOKIE]: session },
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    harness.app,
  );
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text) as unknown };
};

describe('POST /api/lists/:list/refresh-movie-details', () => {
  test('refreshes for Admins and rejects regular members', async () => {
    const draft = await call(createList, 'POST', '/api/lists', admin, {
      title: 'Best Sci-Fi Movies',
      slug: 'best-sci-fi',
      itemSource: { kind: 'tmdb-movie' },
    });
    const draftDto = draft.body as ListDto;
    await call(scheduleList, 'POST', `/api/lists/${draftDto.id}/schedule`, admin, {
      opensAt: harness.clock.now().toISOString(),
      nominationsCloseAt: null,
      closesAt: null,
    });
    const nominated = await call(nominate, 'POST', `/api/lists/${draftDto.id}/entries`, member, {
      externalId: '78',
    });
    expect((nominated.body as EntryDto).item.overview).toBe(
      'A blade runner must pursue replicants.',
    );

    const refreshed = await call(
      refreshMovieDetails,
      'POST',
      `/api/lists/${draftDto.id}/refresh-movie-details`,
      admin,
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body as RefreshMovieDetailsDto).toEqual({
      eligible: 1,
      updated: 0,
      skipped: 1,
      failed: 0,
      remaining: 0,
      next: null,
    });

    const forbidden = await call(
      refreshMovieDetails,
      'POST',
      `/api/lists/${draftDto.id}/refresh-movie-details`,
      member,
    );
    expect(forbidden.status).toBe(403);
  });
});
