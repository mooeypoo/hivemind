import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Fails on any automated WCAG 2.1 A/AA (and best-practice) violation inside `root`.
 * Colour contrast needs real layout, so it is checked from the colour tokens instead
 * (`test/web/contrast.test.ts`).
 */
export const expectAccessible = async (root: Element): Promise<void> => {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
    ),
  ).toEqual([]);
};
