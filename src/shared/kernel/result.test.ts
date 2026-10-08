import { describe, expect, test } from 'vitest';
import { err, ok } from './result.ts';

describe('Result', () => {
  test('ok carries a value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  test('err carries an error', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });
});
