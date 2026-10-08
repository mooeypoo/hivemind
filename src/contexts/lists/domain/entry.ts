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
}

/**
 * The same item always gets the same id in a list. Creating an entry only if its id is new
 * is therefore what makes an item nominatable once per list.
 */
export const entryIdFor = (item: Pick<ItemSnapshot, 'source' | 'externalId'>): EntryId =>
  `${item.source}.${encodeURIComponent(item.externalId)}` as EntryId;
