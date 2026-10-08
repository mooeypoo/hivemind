import { describe, expect, test } from 'vitest';
import type { MemberId } from '../../../shared/kernel/index.ts';
import { entryIdFor, type EntryId } from './entry.ts';
import { emptyLedger, release, reserve } from './ledger.ts';
import type { ListId } from './list.ts';

describe('entry identity', () => {
  test('is derived from the source and externalId, so an item can be nominated once per list', () => {
    const a = entryIdFor({ source: 'tmdb-movie', externalId: '78' });
    expect(a).toBe(entryIdFor({ source: 'tmdb-movie', externalId: '78' }));
    expect(a).not.toBe(entryIdFor({ source: 'preset', externalId: '78' }));
  });

  test('is safe as a storage key, whatever the externalId contains', () => {
    expect(entryIdFor({ source: 'freeform', externalId: 'a/b c?' })).toBe('freeform.a%2Fb%20c%3F');
  });
});

describe('nomination cap', () => {
  const ledger = emptyLedger('m1' as MemberId, 'l1' as ListId);
  const e = (id: string) => id as EntryId;

  test('lets a member reserve up to the cap', () => {
    const one = reserve(ledger, e('a'), 2);
    const two = one.ok ? reserve(one.value, e('b'), 2) : one;
    expect(two.ok && two.value.entryIds).toEqual(['a', 'b']);
    const three = two.ok ? reserve(two.value, e('c'), 2) : two;
    expect(!three.ok && three.error.code).toBe('lists.nomination-cap-reached');
  });

  test('releases a reservation, e.g. when the item was already nominated', () => {
    const one = reserve(ledger, e('a'), 1);
    expect(one.ok && release(one.value, e('a')).entryIds).toEqual([]);
  });
});
