import { expect, test } from 'vitest';
import { coveragePercent, ratingsPerVoter } from './insights.ts';

test('coverage distinguishes no entries from unrated entries and uses the actual denominator', () => {
  expect(coveragePercent(0, 0)).toBeNull();
  expect(coveragePercent(0, 3)).toBe(0);
  expect(coveragePercent(2, 3)).toBe(67);
  expect(coveragePercent(3, 3)).toBe(100);
});
test('ratings per voter does not imply a zero average when nobody participates', () => {
  expect(ratingsPerVoter(0, 0)).toBe('—');
  expect(ratingsPerVoter(11, 3)).toBe('3.7');
});
