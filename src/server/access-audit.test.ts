import { afterEach, describe, expect, test } from 'vitest';
import { auditAccess } from './access-audit.ts';
import { startHarness, type Harness } from './http/testing/harness.ts';
import { FIRST_LIST_SLUG, seedFirstList } from './seed.ts';

let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('access audit', () => {
  test('reports who can view, nominate and rate, and flags lists an older version changed', async () => {
    h = await startHarness();
    await seedFirstList(h.app);
    expect(await auditAccess(h.app)).toEqual([
      {
        slug: FIRST_LIST_SLUG,
        title: 'Best Sci-Fi Movies',
        lifecycle: 'draft',
        view: 'everyone on the server',
        nominate: 'everyone on the server',
        rate: 'everyone on the server',
        needsReview: false,
        previousView: null,
      },
    ]);

    // An older version only knows the legacy fields, and widens participation without `access`.
    const store = h.store('lists');
    const keys = (await store.list({ prefix: 'list/' })).blobs.map((blob) => blob.key);
    for (const key of keys) {
      const record = (await store.get(key, { type: 'json' })) as {
        config: Record<string, unknown>;
        visibility: string;
      };
      await store.setJSON(key, {
        ...record,
        visibility: 'public',
        config: { ...record.config, requiredRoleIds: ['900000000000000077'] },
      });
    }
    expect(await auditAccess(h.app)).toMatchObject([
      { view: 'only site admins', needsReview: true, previousView: 'everyone on the server' },
    ]);
  });
});
