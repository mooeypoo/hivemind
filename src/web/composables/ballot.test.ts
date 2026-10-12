// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stubApi } from '../testing/fixtures.ts';
import { useBallot } from './ballot.ts';

const closed = () =>
  Response.json(
    { error: { code: 'voting.closed', message: 'Voting is not open for this list right now.' } },
    { status: 403 },
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useBallot', () => {
  test('a score shows at once and is saved once it settles', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: { a: 7 } }),
    });
    const onSaved = vi.fn();
    const ballot = useBallot(() => 'list-1', { onSaved });
    ballot.set('a', 7);
    expect(ballot.scores.value).toEqual({ a: 7 });
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(calls.map((call) => call.body)).toEqual([{ entryId: 'a', score: 7 }]);
    expect(onSaved).toHaveBeenCalledOnce();
    expect(ballot.saving.value).toEqual({});
  });

  test('quick changes send only the last value', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: { a: 5 } }),
    });
    const ballot = useBallot(() => 'list-1');
    ballot.set('a', 3);
    ballot.set('a', 4);
    ballot.set('a', 5);
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(calls.map((call) => call.body)).toEqual([{ entryId: 'a', score: 5 }]);
  });

  test('clearing sends a null score', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: {} }),
    });
    const ballot = useBallot(() => 'list-1');
    ballot.load({ a: 3 });
    ballot.set('a', null);
    expect(ballot.scores.value).toEqual({});
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(calls[0]?.body).toEqual({ entryId: 'a', score: null });
  });

  test('a failed save puts the last saved score back and reports why', async () => {
    stubApi({ 'PUT /api/lists/list-1/ballot': closed });
    const ballot = useBallot(() => 'list-1');
    ballot.load({ a: 3 });
    ballot.set('a', 9);
    await vi.advanceTimersByTimeAsync(250);
    await flushPromises();
    expect(ballot.scores.value).toEqual({ a: 3 });
    expect(ballot.errors.value.a).toContain('Voting is not open');
  });

  test('flush sends a change that is still settling', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: { b: 2 } }),
    });
    const ballot = useBallot(() => 'list-1');
    ballot.set('b', 2);
    ballot.flush();
    await flushPromises();
    expect(calls).toHaveLength(1);
  });
});
