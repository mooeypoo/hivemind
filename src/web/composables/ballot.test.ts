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
    expect(calls.map((call) => call.body)).toEqual([{ entryId: 'a', score: 7, revision: null }]);
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
    expect(calls.map((call) => call.body)).toEqual([{ entryId: 'a', score: 5, revision: null }]);
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
    expect(calls[0]?.body).toEqual({ entryId: 'a', score: null, revision: null });
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

  test('reloading after deletion cancels settling scores instead of applying them to a new entry', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: {} }),
    });
    const ballot = useBallot(() => 'list-1');
    ballot.set('deleted', 9);
    ballot.load({});
    await vi.advanceTimersByTimeAsync(250);
    expect(calls).toHaveLength(0);
    expect(ballot.scores.value).toEqual({});
  });

  test('a settling score carries the revision when chosen, not the revision when sent', async () => {
    let revision = 'before';
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': closed,
    });
    const ballot = useBallot(() => 'list-1', { revision: () => revision });
    ballot.set('a', 9);
    revision = 'after';
    await vi.advanceTimersByTimeAsync(250);
    expect(calls[0]?.body).toEqual({ entryId: 'a', score: 9, revision: 'before' });
  });

  test('an old response after reload cannot restore deleted scores or lose a new queued score', async () => {
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const requests: unknown[] = [];
    vi.stubGlobal('fetch', (_input: string, init: RequestInit) => {
      requests.push(JSON.parse(init.body as string));
      return requests.length === 1
        ? old
        : Promise.resolve(Response.json({ listId: 'list-1', scores: { a: 5 } }));
    });
    let revision: string | null = null;
    const onSaved = vi.fn();
    const ballot = useBallot(() => 'list-1', { revision: () => revision, onSaved });
    ballot.set('a', 9);
    await vi.advanceTimersByTimeAsync(250);
    revision = 'after-deletion';
    ballot.load({});
    ballot.set('a', 5);
    await vi.advanceTimersByTimeAsync(250);
    resolveOld(Response.json({ listId: 'list-1', scores: { a: 9 } }));
    await flushPromises();
    expect(requests).toEqual([
      { entryId: 'a', score: 9, revision: null },
      { entryId: 'a', score: 5, revision: 'after-deletion' },
    ]);
    expect(ballot.scores.value).toEqual({ a: 5 });
    expect(ballot.saving.value).toEqual({});
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
