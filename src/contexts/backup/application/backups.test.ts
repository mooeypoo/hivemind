import { beforeEach, describe, expect, test } from 'vitest';
import { anonymous, type Actor, type MemberId } from '../../../shared/kernel/index.ts';
import { FixedClock } from '../../../shared/kernel/testing/index.ts';
import { MAX_LISTS, type BackupFile } from '../domain/backup-file.ts';
import { FakeUpstream, listData } from '../infrastructure/testing/fakes.ts';
import { makeExportLists, makeImportLists } from './backups.ts';

const member = (isAdmin: boolean): Actor => ({
  kind: 'member',
  memberId: 'admin' as MemberId,
  displayName: 'Admin',
  roleIds: [],
  isAdmin,
});
const admin = member(true);
const clock = new FixedClock(new Date('2026-03-01T00:00:00Z'));

let up: FakeUpstream;
beforeEach(() => {
  up = new FakeUpstream();
  up.stored.set('l1', listData('Board games', 'games'));
  up.stored.set('l2', listData('Albums', 'albums', { kind: 'preset', presetId: 'p1' }));
  up.ballotsByList.set('l1', [{ memberId: 'ada' }, { memberId: 'bob' }]);
});

const deps = (keyId: string | null = 'key-id-a') => ({
  lists: up,
  presets: up,
  ballots: up,
  erasures: up,
  keyId,
  clock,
});

const exportAll = async (keyId?: string) => {
  const result = await makeExportLists(deps(keyId))(admin, { list: null });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('export', () => {
  test('one list or all, with presets and sealed ballots', async () => {
    const file = await exportAll();
    expect(file).toMatchObject({ format: 'votable-lists-backup', version: 1, keyId: 'key-id-a' });
    expect(
      file.lists.map((l) => [l.list.config.slug, l.preset !== null, l.ballots !== null]),
    ).toEqual([
      ['games', false, true],
      ['albums', true, false],
    ]);
    const one = await makeExportLists(deps())(admin, { list: 'l2' });
    expect(one.ok && one.value.lists).toHaveLength(1);
  });

  test('is for Admins only, and only when backups are set up', async () => {
    expect((await makeExportLists(deps())(member(false), { list: null })).ok).toBe(false);
    expect((await makeExportLists(deps())(anonymous, { list: null })).ok).toBe(false);
    const off = await makeExportLists(deps(null))(admin, { list: null });
    expect(!off.ok && off.error.code).toBe('backup.not-configured');
  });
});

describe('import', () => {
  test('restores every list, its preset under a new id, and its votes', async () => {
    const file = await exportAll();
    const result = await makeImportLists(deps())(admin, file);
    expect(result.ok && result.value.keyMatched).toBe(true);
    expect(result.ok && result.value.lists).toEqual([
      {
        ok: true,
        title: 'Board games',
        slug: 'games',
        renamed: false,
        hidden: false,
        entries: 2,
        votesRestored: 2,
        membersLeftOut: 0,
      },
      {
        ok: true,
        title: 'Albums',
        slug: 'albums',
        renamed: false,
        hidden: false,
        entries: 2,
        votesRestored: 0,
        membersLeftOut: 0,
      },
    ]);
    expect(up.restored[1]?.itemSource).toEqual({ kind: 'preset', presetId: 'p-new' });
  });

  test('never restores the data of members who erased it', async () => {
    const file = await exportAll();
    up.erased.add('bob');
    const result = await makeImportLists(deps())(admin, file);
    expect(result.ok && result.value.lists[0]).toMatchObject({
      votesRestored: 1,
      membersLeftOut: 1,
    });
    expect(up.restored[0]?.dropped).toEqual(['bob']);
    expect(up.restoredBallots[0]?.memberIds).toEqual(['ada']);
  });

  test('a file made with another backup key restores no personal data at all', async () => {
    const file = await exportAll('key-id-old');
    const result = await makeImportLists(deps('key-id-new'))(admin, file);
    expect(result.ok && result.value.keyMatched).toBe(false);
    expect(up.restored[0]?.kept).toEqual([]);
    expect(up.restoredBallots).toEqual([]);
    expect(result.ok && result.value.lists[0]).toMatchObject({
      votesRestored: 0,
      membersLeftOut: 2,
    });
  });

  test('a list that can’t be restored is reported; the others still are', async () => {
    const file = await exportAll();
    up.failRestoreFor.add('Board games');
    const result = await makeImportLists(deps())(admin, file);
    expect(result.ok && result.value.lists.map((l) => [l.title, l.ok])).toEqual([
      ['Board games', false],
      ['Albums', true],
    ]);
  });

  test('checks the file first, reporting every problem', async () => {
    const file = await exportAll();
    const bad: BackupFile = {
      ...file,
      lists: Array.from({ length: MAX_LISTS + 1 }, () => ({
        ...listData('X', 'x', { kind: 'preset', presetId: 'p' }),
        preset: null,
        ballots: null,
      })),
    };
    const result = await makeImportLists(deps())(admin, bad);
    expect(!result.ok && result.error.code).toBe('backup.invalid-file');
    expect(!result.ok && result.error.details?.[0]).toBe('A backup can hold at most 200 lists.');
    expect(!result.ok && result.error.details?.length).toBe(MAX_LISTS + 2);
  });

  test('is for Admins only', async () => {
    const file = await exportAll();
    expect((await makeImportLists(deps())(member(false), file)).ok).toBe(false);
    expect(up.restored).toEqual([]);
  });
});
