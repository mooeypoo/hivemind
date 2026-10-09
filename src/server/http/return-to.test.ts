import { describe, expect, test } from 'vitest';
import { safeReturnPath } from './return-to.ts';

describe('safeReturnPath', () => {
  test.each(['/', '/lists/best-sci-fi', '/admin/lists/x?tab=schedule', '/lists/a#entries'])(
    'keeps the same-site path %s',
    (path) => {
      expect(safeReturnPath(path)).toBe(path);
    },
  );

  test.each([
    null,
    undefined,
    '',
    'lists',
    '//evil.example',
    '///evil.example',
    'https://evil.example',
    '/\\evil.example',
    '/\tevil',
    '\\\\evil.example',
    `/${'a'.repeat(600)}`,
  ])('turns %j into /', (raw) => {
    expect(safeReturnPath(raw)).toBe('/');
  });
});
