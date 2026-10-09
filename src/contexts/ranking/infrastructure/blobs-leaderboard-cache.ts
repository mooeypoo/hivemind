import type { Store } from '@netlify/blobs';
import type { LeaderboardCache } from '../application/ports.ts';
import type { Leaderboard, LeaderboardRow } from '../domain/leaderboard.ts';

/*
 * Store: `ranking`. Keys: leaderboard/{listId}. Derived data with no member ids, so
 * writes are unconditional: a concurrent rebuild produces the same board.
 */

interface LeaderboardRecordV1 {
  readonly v: 1;
  readonly listId: string;
  readonly computedAt: string;
  readonly entryIds: readonly string[];
  readonly rows: readonly LeaderboardRow[];
}

export const createBlobsLeaderboardCache = (store: Store): LeaderboardCache => ({
  async get(listId) {
    const record = (await store.get(`leaderboard/${listId}`, {
      type: 'json',
    })) as Partial<LeaderboardRecordV1> | null;
    // An unreadable record is only a cache miss: it is rebuilt.
    if (record?.v !== 1 || record.computedAt === undefined || record.rows === undefined)
      return null;
    return {
      listId,
      computedAt: new Date(record.computedAt),
      entryIds: record.entryIds ?? [],
      rows: record.rows,
    };
  },

  async put(board: Leaderboard) {
    const record: LeaderboardRecordV1 = {
      v: 1,
      listId: board.listId,
      computedAt: board.computedAt.toISOString(),
      entryIds: board.entryIds,
      rows: board.rows,
    };
    await store.setJSON(`leaderboard/${board.listId}`, record);
  },

  async computedTimes() {
    const { blobs } = await store.list({ prefix: 'leaderboard/' });
    const records = await Promise.all(
      blobs.map(async (blob) => ({
        listId: blob.key.slice('leaderboard/'.length),
        record: (await store.get(blob.key, {
          type: 'json',
        })) as Partial<LeaderboardRecordV1> | null,
      })),
    );
    // An unreadable board counts as ancient, so it is cleared.
    return records.map(({ listId, record }) => ({
      listId,
      computedAt: new Date(record?.computedAt ?? 0),
    }));
  },

  async delete(listId) {
    await store.delete(`leaderboard/${listId}`);
  },
});
