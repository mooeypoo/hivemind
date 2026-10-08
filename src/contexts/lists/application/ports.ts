import type { DomainError, MemberId, Result } from '../../../shared/kernel/index.ts';
import type { Entry, EntryId, ItemSnapshot } from '../domain/entry.ts';
import type { NominationLedger } from '../domain/ledger.ts';
import type { ItemSourceRef, List, ListId } from '../domain/list.ts';

export interface Versioned<T> {
  readonly value: T;
  /** Opaque concurrency token (the Blobs ETag). */
  readonly version: string;
}

export interface ListRepository {
  get(id: ListId): Promise<Versioned<List> | null>;
  /** Creates when `expectedVersion` is null; otherwise updates only if unchanged. False on a lost race. */
  save(list: List, expectedVersion: string | null): Promise<boolean>;
  all(): Promise<List[]>;
}

/** Slugs are unique: a slug is claimed before a list may use it. */
export interface SlugIndex {
  lookup(slug: string): Promise<ListId | null>;
  /** False when another list holds the slug. */
  claim(slug: string, id: ListId): Promise<boolean>;
  release(slug: string): Promise<void>;
}

export interface EntryRepository {
  /** False when an entry with this id already exists in the list. */
  create(entry: Entry): Promise<boolean>;
  get(listId: ListId, entryId: EntryId): Promise<Versioned<Entry> | null>;
  save(entry: Entry, expectedVersion: string): Promise<boolean>;
  forList(listId: ListId): Promise<Entry[]>;
}

export interface LedgerRepository {
  get(memberId: MemberId, listId: ListId): Promise<Versioned<NominationLedger> | null>;
  save(ledger: NominationLedger, expectedVersion: string | null): Promise<boolean>;
  forMember(memberId: MemberId): Promise<NominationLedger[]>;
  delete(memberId: MemberId, listId: ListId): Promise<void>;
}

/** The catalog, as lists needs it. Implemented over the catalog module in infrastructure. */
export interface Catalog {
  checkSource(
    ref: ItemSourceRef,
    options: { readonly seeded: boolean },
  ): Promise<Result<void, DomainError>>;
  search(ref: ItemSourceRef, query: string): Promise<Result<readonly ItemSnapshot[], DomainError>>;
  /** Validates the item against its source. `key` is an externalId, or a title for free text. */
  resolve(ref: ItemSourceRef, key: string): Promise<Result<ItemSnapshot, DomainError>>;
  seedItems(ref: ItemSourceRef): Promise<Result<readonly ItemSnapshot[], DomainError>>;
}
