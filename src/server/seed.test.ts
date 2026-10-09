import { afterEach, describe, expect, test } from 'vitest';
import { startHarness, testConfig, type Harness } from './http/testing/harness.ts';
import { FIRST_LIST_SLUG, seedFirstList } from './seed.ts';

let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('seed script', () => {
  test('creates "Best Sci-Fi Movies" as a TMDB draft scored 1–10, once', async () => {
    h = await startHarness();
    expect(await seedFirstList(h.app)).toBe('created');
    expect(await seedFirstList(h.app)).toBe('exists');
    const lists = await h.app.lists.listLists(h.app.identity.operatorActor('test'));
    expect(
      lists.ok &&
        lists.value.map((list) => [list.slug, list.lifecycle, list.itemSource.kind, list.scale]),
    ).toEqual([[FIRST_LIST_SLUG, 'draft', 'tmdb-movie', { min: 1, max: 10 }]]);
  });

  test('explains when the site has no TMDB token', async () => {
    h = await startHarness({ ...testConfig, tmdbReadToken: null });
    await expect(seedFirstList(h.app)).rejects.toThrow(/not available/);
  });
});
