import type { Store } from '@netlify/blobs';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import type { MemberId } from '../../../shared/kernel/index.ts';
import type { BallotRepository } from '../application/ports.ts';
import type { Ballot, BallotListId } from '../domain/ballot.ts';

/*
 * Store: `voting`. Keys: ballot/{listId}/{memberId}.
 * List-first, so ranking reads a list's ballots by prefix. Finding one member's ballots
 * (export and erasure only) lists every ballot key and filters by the member suffix:
 * slower, but there is no second index to keep consistent.
 */

interface BallotRecordV1 {
  readonly v: 1;
  readonly listId: string;
  readonly memberId: string;
  readonly scores: Readonly<Record<string, number>>;
}

const key = (listId: string, memberId: string): string => `ballot/${listId}/${memberId}`;

const toRecord = (ballot: Ballot): BallotRecordV1 => ({
  v: 1,
  listId: ballot.listId,
  memberId: ballot.memberId,
  scores: ballot.scores,
});

const fromRecord = (data: unknown): Ballot => {
  const record = data as Partial<BallotRecordV1> | null;
  if (record?.v !== 1 || typeof record.listId !== 'string' || typeof record.memberId !== 'string') {
    throw new Error('Unreadable ballot record');
  }
  return {
    listId: record.listId as BallotListId,
    memberId: record.memberId as MemberId,
    scores: record.scores ?? {},
  };
};

const readKeys = async (store: Store, keys: readonly string[]): Promise<Ballot[]> => {
  const values = await Promise.all(keys.map((k) => store.get(k, { type: 'json' })));
  return values.filter((value) => value !== null).map(fromRecord);
};

export const createBlobsBallotRepository = (store: Store): BallotRepository => ({
  async get(listId, memberId) {
    const entry = await readVersioned(store, key(listId, memberId));
    return entry === null ? null : { ballot: fromRecord(entry.data), version: entry.version };
  },

  save: (ballot, expectedVersion) =>
    writeVersioned(store, key(ballot.listId, ballot.memberId), toRecord(ballot), expectedVersion),

  async delete(listId, memberId) {
    await store.delete(key(listId, memberId));
  },

  async forList(listId) {
    const { blobs } = await store.list({ prefix: `ballot/${listId}/` });
    return readKeys(
      store,
      blobs.map((blob) => blob.key),
    );
  },

  async forMember(memberId) {
    const { blobs } = await store.list({ prefix: 'ballot/' });
    return readKeys(
      store,
      blobs.map((blob) => blob.key).filter((k) => k.endsWith(`/${memberId}`)),
    );
  },
});
