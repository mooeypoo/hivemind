// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import ScoreInput from './ScoreInput.vue';

const mountWith = (value: number | null, scale = { min: 1, max: 10 }) =>
  mount(ScoreInput, { props: { value, scale, itemTitle: 'Root' } });

const ends = (input: ReturnType<typeof mountWith>) =>
  input.findAll('.score-scale__end').map((end) => end.text());

describe('ScoreInput', () => {
  test('says which end is high, visibly and for screen readers', () => {
    const input = mountWith(null);
    expect(ends(input)).toEqual(['1 lowest', 'highest 10']);
    expect(input.get('legend').text()).toContain('for Root, from 1 (lowest) to 10 (highest)');
    const labels = input.findAll('.score-chip').map((chip) => chip.text());
    expect(labels[0]).toBe('1 (lowest)');
    expect(labels[4]).toBe('5');
    expect(labels[9]).toBe('10 (highest)');
  });

  test('chips warm up from the lowest score to the highest', () => {
    const levels = mountWith(null)
      .findAll('.score-chip')
      .map((chip) => /score-chip--level-(\d)/.exec(chip.classes().join(' '))?.[1]);
    expect(levels).toEqual(['0', '0', '1', '1', '2', '2', '3', '3', '4', '4']);
  });

  test('an unrated entry has no chip selected; a rated one has exactly its own', () => {
    expect(mountWith(null).find('input:checked').exists()).toBe(false);
    const rated = mountWith(7);
    expect(rated.get<HTMLInputElement>('input:checked').element.value).toBe('7');
  });

  test('choosing a chip or Clear reports the change', async () => {
    const input = mountWith(3);
    await input.get('input[value="8"]').trigger('change');
    await input.get('.score-input__clear').trigger('click');
    expect(input.emitted('change')).toEqual([[8], [null]]);
  });

  test('wide scales use a slider that names both ends', () => {
    const input = mountWith(null, { min: 0, max: 100 });
    expect(input.get('input[type="range"]').attributes('aria-label')).toBe(
      'Your score for Root, from 0 (lowest) to 100 (highest)',
    );
    expect(ends(input)).toEqual(['0 lowest', 'highest 100']);
  });
});
