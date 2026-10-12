import type { Brand, MemberId } from '../../../shared/kernel/index.ts';
import type { ListId } from './list.ts';

export type EntryId = Brand<string, 'EntryId'>;

/** The catalog item as it was when nominated. Lists never look it up again. */
export interface ItemSnapshot {
  readonly source: string;
  readonly externalId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
}

/** Display name is a snapshot too, so lists never needs identity. Erasure sets it to null. */
export interface Nominator {
  readonly memberId: MemberId;
  readonly displayName: string;
}

export interface Entry {
  readonly id: EntryId;
  readonly listId: ListId;
  readonly item: ItemSnapshot;
  /** Null for seeded entries, and after the nominator erased their data. */
  readonly nominatedBy: Nominator | null;
  readonly nominatedAt: Date;
  readonly nominationId?: string | null;
  readonly withdrawnAt?: Date | null;
  readonly withdrawnNominationIds?: readonly string[];
  /** Set once the item's details were removed under its source's retention terms. */
  readonly snapshotPurgedAt: Date | null;
}

/**
 * The same item always gets the same id in a list. Creating an entry only if its id is new
 * is therefore what makes an item nominatable once per list.
 */
export const entryIdFor = (item: Pick<ItemSnapshot, 'source' | 'externalId'>): EntryId =>
  `${item.source}.${encodeURIComponent(item.externalId)}` as EntryId;

export const isActiveEntry = (entry: Entry): boolean => entry.withdrawnAt == null;

export const nominationToken = (entry: Entry): string =>
  entry.nominationId ?? entry.nominatedAt.toISOString();

export const PURGED_TITLE = 'Details removed (archived over 6 months ago)';

/**
 * The entry with its item's details removed, keeping only what identifies it, so scores and
 * ranks still line up. Used for sources whose terms limit how long details may be kept (TMDB).
 */
export const purgeSnapshot = (entry: Entry, now: Date): Entry => ({
  ...entry,
  item: {
    source: entry.item.source,
    externalId: entry.item.externalId,
    title: PURGED_TITLE,
    subtitle: null,
    imageUrl: null,
  },
  snapshotPurgedAt: now,
});
