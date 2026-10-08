import { describe, expect, test } from 'vitest';
import { withConflictRetry } from './conflict-retry.ts';
import { domainError } from './domain-error.ts';
import { err, ok } from './result.ts';

const conflict = domainError('conflict', 'test.conflict', 'Concurrent write');

describe('withConflictRetry', () => {
  test('returns the first result when it is not a conflict', async () => {
    let calls = 0;
    const result = await withConflictRetry(() => {
      calls += 1;
      return Promise.resolve(ok('done'));
    });
    expect(result).toEqual(ok('done'));
    expect(calls).toBe(1);
  });

  test('retries once after a conflict', async () => {
    let calls = 0;
    const result = await withConflictRetry(() => {
      calls += 1;
      return Promise.resolve(calls === 1 ? err(conflict) : ok('done'));
    });
    expect(result).toEqual(ok('done'));
    expect(calls).toBe(2);
  });

  test('returns the conflict when the retry also conflicts', async () => {
    let calls = 0;
    const result = await withConflictRetry(() => {
      calls += 1;
      return Promise.resolve(err(conflict));
    });
    expect(result).toEqual(err(conflict));
    expect(calls).toBe(2);
  });

  test('does not retry other errors', async () => {
    let calls = 0;
    const forbidden = domainError('forbidden', 'test.forbidden', 'No');
    const result = await withConflictRetry(() => {
      calls += 1;
      return Promise.resolve(err(forbidden));
    });
    expect(result).toEqual(err(forbidden));
    expect(calls).toBe(1);
  });
});
