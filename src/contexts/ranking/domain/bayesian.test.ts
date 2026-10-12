import { describe, expect, test } from 'vitest';
import { bayesian, type RankingInput } from './bayesian.ts';

const entry = (id: string, title = id) => ({ id, title });

/** Ballots as anonymous score maps, entry id → score. */
const input = (
  entries: string[],
  ballots: Record<string, number>[],
  minVotes: number,
): RankingInput => ({ entries: entries.map((id) => entry(id)), ballots, minVotes });

const byId = (rows: ReturnType<typeof bayesian>) =>
  Object.fromEntries(rows.map((row) => [row.entryId, row]));

describe('Bayesian ranking', () => {
  test('computes (v/(v+m))·R + (m/(v+m))·C', () => {
    // a: 10, 10 (R=10, v=2). b: 6 (R=6, v=1). C = (10+10+6)/3 = 26/3. m = 2.
    const rows = byId(bayesian(input(['a', 'b'], [{ a: 10, b: 6 }, { a: 10 }], 2)));
    const C = 26 / 3;
    expect(rows.a?.score).toBeCloseTo((2 / 4) * 10 + (2 / 4) * C, 10);
    expect(rows.b?.score).toBeCloseTo((1 / 3) * 6 + (2 / 3) * C, 10);
    expect(rows.b?.votes).toBe(1);
  });

  test('with m = 0 the score is the plain mean, and nothing is provisional', () => {
    const rows = bayesian(input(['a', 'b'], [{ a: 3, b: 9 }, { a: 5 }], 0));
    expect(rows.map((row) => [row.entryId, row.score, row.provisional])).toEqual([
      ['b', 9, false],
      ['a', 4, false],
    ]);
  });

  test('entries with fewer than m votes are provisional, with the votes they still need', () => {
    const rows = byId(bayesian(input(['a', 'b'], [{ a: 5, b: 5 }, { a: 5 }, { a: 5 }], 3)));
    expect(rows.a).toMatchObject({ provisional: false, votesNeeded: 0 });
    expect(rows.b).toMatchObject({ provisional: true, votesNeeded: 2 });
  });

  test('a single high vote does not beat a well-supported high average', () => {
    const ballots = [{ a: 9, b: 10 }, { a: 9 }, { a: 9 }, { a: 9 }, { a: 9 }, { c: 1 }];
    const rows = bayesian(input(['a', 'b', 'c'], ballots, 5));
    expect(rows.map((row) => row.entryId)).toEqual(['a', 'b', 'c']);
  });

  test('provisional entries have no rank and come after every ranked entry, whatever their score', () => {
    // b: three 10s (provisional at m = 4). a: four 8s. c: four 6s. d: no votes.
    const ballots = [
      { a: 8, b: 10, c: 6 },
      { a: 8, b: 10, c: 6 },
      { a: 8, b: 10, c: 6 },
      { a: 8, c: 6 },
    ];
    const rows = bayesian(input(['a', 'b', 'c', 'd'], ballots, 4));
    expect(rows.map((row) => [row.entryId, row.rank, row.provisional])).toEqual([
      ['a', 1, false],
      ['c', 2, false],
      ['b', null, true],
      ['d', null, true],
    ]);
    expect(byId(rows).b?.score).toBeGreaterThan(byId(rows).a?.score ?? Infinity);
  });

  test('when nothing has enough votes yet, nothing is ranked', () => {
    const rows = bayesian(input(['a', 'b'], [{ a: 9, b: 4 }], 3));
    expect(rows.map((row) => [row.entryId, row.rank])).toEqual([
      ['a', null],
      ['b', null],
    ]);
  });

  test('entries without votes are unranked and listed last', () => {
    const rows = bayesian(input(['a', 'b', 'c'], [{ b: 2 }], 1));
    expect(rows.map((row) => [row.entryId, row.rank, row.score, row.votes])).toEqual([
      ['b', 1, 2, 1],
      ['a', null, null, 0],
      ['c', null, null, 0],
    ]);
  });

  test('with no votes at all, nothing is ranked', () => {
    expect(bayesian(input(['a', 'b'], [], 3)).every((row) => row.rank === null)).toBe(true);
  });

  test('equal scores share a rank; the next rank skips (1, 2, 2, 4)', () => {
    const rows = bayesian(input(['a', 'b', 'c', 'd'], [{ a: 9, b: 7, c: 7, d: 1 }], 0));
    expect(rows.map((row) => [row.entryId, row.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
    ]);
  });

  test('ties are ordered by votes, then title', () => {
    const entries = [entry('x', 'Zebra'), entry('y', 'Apple'), entry('z', 'Mango')];
    const ballots = [{ x: 5, y: 5, z: 5 }, { z: 5 }];
    const rows = bayesian({ entries, ballots, minVotes: 0 });
    expect(rows.map((row) => row.entryId)).toEqual(['z', 'y', 'x']);
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1]);
  });

  test('ignores scores for entries that are not in the list', () => {
    const rows = bayesian(input(['a'], [{ a: 4, gone: 10 }], 0));
    expect(rows).toEqual([
      { entryId: 'a', rank: 1, score: 4, votes: 1, provisional: false, votesNeeded: 0 },
    ]);
  });

  test('is pure: the same input always gives the same output', () => {
    const same = input(['a', 'b'], [{ a: 3, b: 4 }, { b: 2 }], 2);
    expect(bayesian(same)).toEqual(bayesian(same));
  });
});
