import { vi } from 'vitest';
import type { ListDetailDto } from '../../server/http/contracts.ts';

export const openTmdbList = (overrides: Partial<ListDetailDto> = {}): ListDetailDto => ({
  id: 'list-1',
  title: 'Best Sci-Fi Movies',
  slug: 'best-sci-fi',
  description: '',
  itemSource: { kind: 'tmdb-movie' },
  entryMode: 'nominations',
  scale: { min: 1, max: 10 },
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  ranking: { strategy: 'bayesian', minVotes: 5 },
  showNominators: true,
  requiredRoleIds: [],
  lifecycle: 'open',
  schedule: {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: null,
    closesAt: '2099-01-01T00:00:00.000Z',
  },
  viewer: { canParticipate: true, canNominate: true, nominationsUsed: 0 },
  entries: [],
  ...overrides,
});

export interface FakeCall {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

/**
 * Replaces `fetch` with routes keyed by `METHOD /path` (query ignored). Records every call.
 * Unrouted requests fail the test loudly.
 */
export const stubApi = (routes: Record<string, (call: FakeCall) => Response>) => {
  const calls: FakeCall[] = [];
  vi.stubGlobal('fetch', (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const call = { method, url: input, body };
    calls.push(call);
    const route = routes[`${method} ${input.split('?')[0] ?? ''}`];
    if (route === undefined) return Promise.reject(new Error(`Unrouted ${method} ${input}`));
    return Promise.resolve(route(call));
  });
  return calls;
};
