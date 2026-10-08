import type { Store } from '@netlify/blobs';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import { err, ok, type MemberId } from '../../../shared/kernel/index.ts';
import type { MemberRepository } from '../application/ports.ts';
import { identityErrors } from '../domain/errors.ts';
import type { Member } from '../domain/member.ts';

/** Persistence record. Domain objects are never serialized directly. */
interface MemberRecordV1 {
  readonly v: 1;
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string;
}

const key = (id: MemberId): string => `member/${id}`;

const toRecord = (member: Member): MemberRecordV1 => ({
  v: 1,
  id: member.id,
  displayName: member.displayName,
  avatarUrl: member.avatarUrl,
});

const fromRecord = (record: unknown): Member => {
  const r = record as Partial<MemberRecordV1> | null;
  if (r?.v !== 1 || typeof r.id !== 'string') {
    throw new Error('Unreadable member record');
  }
  return { id: r.id as MemberId, displayName: r.displayName ?? '', avatarUrl: r.avatarUrl ?? '' };
};

/** Store: `identity`. Keys: `member/{memberId}`. */
export const createBlobsMemberRepository = (store: Store): MemberRepository => ({
  async get(id) {
    const entry = await readVersioned(store, key(id));
    return entry === null ? null : { member: fromRecord(entry.data), version: entry.version };
  },

  async save(member, expectedVersion) {
    const written = await writeVersioned(store, key(member.id), toRecord(member), expectedVersion);
    return written ? ok(undefined) : err(identityErrors.memberConflict);
  },

  async delete(id) {
    await store.delete(key(id));
  },
});
