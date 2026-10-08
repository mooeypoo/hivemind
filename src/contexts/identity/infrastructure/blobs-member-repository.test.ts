import type { Store } from '@netlify/blobs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  startLocalBlobs,
  type LocalBlobs,
} from '../../../shared/infrastructure/testing/local-blobs.ts';
import type { MemberId } from '../../../shared/kernel/index.ts';
import { identityErrors } from '../domain/errors.ts';
import type { Member } from '../domain/member.ts';
import { createBlobsMemberRepository } from './blobs-member-repository.ts';

let blobs: LocalBlobs;
let store: Store;

beforeAll(async () => {
  blobs = await startLocalBlobs();
  store = blobs.store('identity');
});

afterAll(async () => {
  await blobs.close();
});

const ada: Member = {
  id: '1001' as MemberId,
  displayName: 'Ada',
  avatarUrl: 'https://cdn.discordapp.com/avatars/1001/abc.png',
};

describe('Blobs member repository', () => {
  test('creates, reads, updates with the version, and deletes', async () => {
    const repo = createBlobsMemberRepository(store);
    expect(await repo.get(ada.id)).toBeNull();

    expect((await repo.save(ada, null)).ok).toBe(true);
    const created = await repo.get(ada.id);
    expect(created?.member).toEqual(ada);

    const renamed = { ...ada, displayName: 'Ada L.' };
    expect((await repo.save(renamed, created?.version ?? null)).ok).toBe(true);
    expect((await repo.get(ada.id))?.member).toEqual(renamed);

    await repo.delete(ada.id);
    expect(await repo.get(ada.id)).toBeNull();
  });

  test('writes a versioned record holding only id, display name and avatar URL', async () => {
    const repo = createBlobsMemberRepository(store);
    await repo.save(ada, null);
    expect(await store.get('member/1001', { type: 'json' })).toEqual({
      v: 1,
      id: '1001',
      displayName: 'Ada',
      avatarUrl: 'https://cdn.discordapp.com/avatars/1001/abc.png',
    });
    await repo.delete(ada.id);
  });

  test('a create loses to an existing member, and an update loses to a newer version', async () => {
    const repo = createBlobsMemberRepository(store);
    await repo.save(ada, null);
    const stale = await repo.get(ada.id);

    expect(await repo.save(ada, null)).toEqual({ ok: false, error: identityErrors.memberConflict });

    await repo.save({ ...ada, displayName: 'First' }, stale?.version ?? null);
    expect(await repo.save({ ...ada, displayName: 'Second' }, stale?.version ?? null)).toEqual({
      ok: false,
      error: identityErrors.memberConflict,
    });
    expect((await repo.get(ada.id))?.member.displayName).toBe('First');
    await repo.delete(ada.id);
  });
});
