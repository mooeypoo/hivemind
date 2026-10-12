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
  votes,
  provisional,
  votesNeeded: provisional ? 3 - votes : 0,
});

describe('buildStandings', () => {
  test('ranks entries with enough votes; provisional ones wait in their own group', () => {
    const standings = buildStandings(
      [
        row('a', 1, 5),
        row('c', 2, 4),
        row('d', 2, 3),
        row('f', 4, 3),
        row('b', null, 1, true),
        row('e', null, 0),
      ],
      [entry('a', 'Ada'), entry('b'), entry('c'), entry('d'), entry('e'), entry('f')],
    );
    expect(standings.podium.map((r) => [r.entryId, r.rank, r.nominatedBy])).toEqual([
      ['a', 1, 'Ada'],
      ['c', 2, null],
      ['d', 2, null],
    ]);
    expect(standings.rest.map((r) => [r.entryId, r.rank])).toEqual([['f', 4]]);
    expect(standings.provisional.map((r) => [r.entryId, r.votesNeeded])).toEqual([['b', 2]]);
    expect(standings.unrated.map((r) => r.entryId)).toEqual(['e']);
  });

  test('a provisional entry never reaches the podium, however high its score', () => {
    // A board cached before provisional entries lost their rank still sorts correctly.
    const top = { ...row('b', 1, 2, true), score: 9.9 };
    const standings = buildStandings([top, row('a', 2, 9)], [entry('a'), entry('b')]);
    expect(standings.podium.map((r) => r.entryId)).toEqual(['a']);
    expect(standings.provisional.map((r) => r.entryId)).toEqual(['b']);
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
