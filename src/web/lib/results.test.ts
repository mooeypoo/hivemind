import { describe, expect, test } from 'vitest';
import type { EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';
import { buildResults } from './results.ts';

const item = (title: string) => ({
  source: 'freeform',
  externalId: title,
  title,
  subtitle: null,
  imageUrl: null,
});
const entry = (id: string, nominatedBy: string | null = null): EntryDto => ({
  id,
  item: item(id),
  nominatedBy,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
});
const row = (
  entryId: string,
  rank: number | null,
  votes: number,
  provisional = false,
): LeaderboardRowDto => ({
  rank,
  entryId,
  item: item(entryId),
  score: rank === null ? null : 10 - rank,
  average: rank === null ? null : 10 - rank,
  votes,
  provisional,
  votesNeeded: provisional ? 3 - votes : 0,
});

describe('buildResults', () => {
  test('numbers confirmed entries among themselves and moves provisional ones after them', () => {
    const results = buildResults(
      [row('a', 1, 5), row('b', 2, 1, true), row('c', 3, 4), row('d', 3, 3), row('e', null, 0)],
      [entry('a', 'Ada'), entry('b'), entry('c'), entry('d'), entry('e')],
    );
    expect(results.ranked.map((r) => [r.entryId, r.position, r.nominatedBy])).toEqual([
      ['a', 1, 'Ada'],
      ['c', 2, null],
      ['d', 2, null],
    ]);
    expect(results.provisional.map((r) => [r.entryId, r.position, r.votesNeeded])).toEqual([
      ['b', null, 2],
    ]);
    expect(results.unrated.map((r) => r.entryId)).toEqual(['e']);
  });

  test('entries missing from the board count as not yet rated', () => {
    const results = buildResults([row('a', 1, 5)], [entry('a'), entry('new', 'Bob')]);
    expect(results.unrated.map((r) => [r.entryId, r.nominatedBy])).toEqual([['new', 'Bob']]);
  });
});
