import type { InsightsDto, ListInsightDto } from '../../src/server/http/contracts.ts';

export const insightsFixture = (
  state: 'loaded' | 'empty' | 'after-close' | 'paused' | 'zero' = 'loaded',
): InsightsDto => {
  const metrics = {
    entries: 24,
    ratings: 137,
    voters: 17,
    nominators: 8,
    ratedEntries: 18,
    readyEntries: 12,
    withdrawnEntries: 2,
    setAsideEntries: 1,
  };
  const zero = {
    entries: 0,
    ratings: 0,
    voters: 0,
    nominators: 0,
    ratedEntries: 0,
    readyEntries: 0,
    withdrawnEntries: 0,
    setAsideEntries: 0,
  };
  const base = {
    id: 'list-1',
    title: 'The Greatest Science-Fiction Films Of All Time, Ranked Together',
    slug: 'films',
    lifecycle: 'open',
    viewers: 'everyone',
    source: 'freeform',
    entryMode: 'nominations',
  } as const;
  const available: ListInsightDto = {
    ...base,
    status: 'available',
    metrics: state === 'zero' ? zero : metrics,
    minVotes: 3,
    distribution:
      state === 'zero'
        ? []
        : [
            { ratings: 0, entries: 6 },
            { ratings: 1, entries: 3 },
            { ratings: 2, entries: 3 },
            { ratings: 8, entries: 8 },
            { ratings: 16, entries: 4 },
          ],
  };
  const excluded: ListInsightDto =
    state === 'paused'
      ? { ...base, id: 'list-2', title: 'Cleanup in progress', slug: 'paused', status: 'paused' }
      : {
          ...base,
          id: 'list-2',
          title: 'A surprise for closing night',
          slug: 'surprise',
          viewers: 'site-admins',
          status: 'after-close',
          revealsAt: null,
        };
  return {
    computedAt: '2026-10-18T12:00:00Z',
    includedLists: state === 'loaded' || state === 'zero' ? 1 : 0,
    excludedLists: state === 'loaded' || state === 'after-close' || state === 'paused' ? 1 : 0,
    totals: state === 'loaded' ? metrics : zero,
    lists:
      state === 'empty'
        ? []
        : state === 'zero'
          ? [available]
          : state === 'loaded'
            ? [available, excluded]
            : [excluded],
  };
};
