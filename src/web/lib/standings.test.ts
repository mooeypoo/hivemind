import { describe, expect, test } from 'vitest';
import type { EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';
import { buildStandings, scalePercent } from './standings.ts';

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

describe('buildStandings', () => {
  test('keeps provisional entries in their computed place, with shared ranks', () => {
    const standings = buildStandings(
      [row('a', 1, 5), row('b', 2, 1, true), row('c', 3, 4), row('d', 3, 3), row('e', null, 0)],
      [entry('a', 'Ada'), entry('b'), entry('c'), entry('d'), entry('e')],
    );
    expect(standings.podium.map((r) => [r.entryId, r.rank, r.provisional, r.nominatedBy])).toEqual([
      ['a', 1, false, 'Ada'],
      ['b', 2, true, null],
      ['c', 3, false, null],
    ]);
    expect(standings.rest.map((r) => [r.entryId, r.rank])).toEqual([['d', 3]]);
    expect(standings.unrated.map((r) => r.entryId)).toEqual(['e']);
  });

  test('entries missing from the board count as not yet rated', () => {
    const standings = buildStandings([row('a', 1, 5)], [entry('a'), entry('new', 'Bob')]);
    expect(standings.unrated.map((r) => [r.entryId, r.nominatedBy])).toEqual([['new', 'Bob']]);
  });

  test('with no votes at all, nothing is ranked', () => {
    const standings = buildStandings([row('a', null, 0)], [entry('a')]);
    expect(standings.podium).toEqual([]);
    expect(standings.unrated).toHaveLength(1);
  });
});

describe('scalePercent', () => {
  test('places a score on the list scale', () => {
    expect(scalePercent(1, { min: 1, max: 10 })).toBe(0);
    expect(scalePercent(5.5, { min: 1, max: 10 })).toBe(50);
    expect(scalePercent(10, { min: 1, max: 10 })).toBe(100);
    expect(scalePercent(12, { min: 1, max: 10 })).toBe(100);
  });
});
