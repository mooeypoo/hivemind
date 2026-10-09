import { describe, expect, test } from 'vitest';
import type { MemberId } from '../../../shared/kernel/index.ts';
import {
  clearScore,
  emptyBallot,
  setScore,
  type BallotListId,
  type BallotEntryId,
} from './ballot.ts';

const ballot = emptyBallot('l1' as BallotListId, 'm1' as MemberId);
const entry = (id: string) => id as BallotEntryId;
const scale = { min: 1, max: 10 };

describe('Ballot', () => {
  test('starts empty, one per member per list', () => {
    expect(ballot).toEqual({ listId: 'l1', memberId: 'm1', scores: {} });
  });

  test.each([1, 5, 10])('accepts a whole score within the scale: %i', (score) => {
    const result = setScore(ballot, entry('e1'), score, scale);
    expect(result.ok && result.value.scores).toEqual({ e1: score });
  });

  test.each([0, 11, 5.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (score) => {
    const result = setScore(ballot, entry('e1'), score, scale);
    expect(!result.ok && result.error.code).toBe('voting.score-out-of-range');
  });

  test('honours scales that start at 0', () => {
    expect(setScore(ballot, entry('e1'), 0, { min: 0, max: 5 }).ok).toBe(true);
  });

  test('a new score replaces the old one; other entries are untouched', () => {
    const first = setScore(ballot, entry('e1'), 3, scale);
    const second = first.ok ? setScore(first.value, entry('e2'), 7, scale) : first;
    const third = second.ok ? setScore(second.value, entry('e1'), 9, scale) : second;
    expect(third.ok && third.value.scores).toEqual({ e1: 9, e2: 7 });
  });

  test('clearing removes only that score', () => {
    const scored = setScore(ballot, entry('e1'), 3, scale);
    const both = scored.ok ? setScore(scored.value, entry('e2'), 4, scale) : scored;
    expect(both.ok && clearScore(both.value, entry('e1')).scores).toEqual({ e2: 4 });
  });
});
