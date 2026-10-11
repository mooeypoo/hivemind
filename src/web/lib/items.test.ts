import { describe, expect, test } from 'vitest';
import { initials, scaleValues, titleCardVariant, usesScoreChips } from './items.ts';

describe('item helpers', () => {
  test('a title always gets the same title card variant, from 1 to 6', () => {
    const variants = ['Root', 'Wingspan', 'Azul', 'Blue', 'Rumours', 'OK Computer', 'Alien'].map(
      titleCardVariant,
    );
    expect(variants.every((v) => v >= 1 && v <= 6)).toBe(true);
    expect(titleCardVariant('Root')).toBe(variants[0]);
    expect(new Set(variants).size).toBeGreaterThan(1);
  });

  test('initials take the first letters of up to two words', () => {
    expect(initials('kind of  blue')).toBe('KO');
    expect(initials('Alien')).toBe('A');
  });

  test('scales up to 11 values use chips, wider ones a slider', () => {
    expect(usesScoreChips({ min: 1, max: 10 })).toBe(true);
    expect(usesScoreChips({ min: 0, max: 10 })).toBe(true);
    expect(usesScoreChips({ min: 0, max: 100 })).toBe(false);
    expect(scaleValues({ min: 1, max: 5 })).toEqual([1, 2, 3, 4, 5]);
  });
});
