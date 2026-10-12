import type { MemberId } from '../../../../shared/kernel/index.ts';
import type {
  EntryRepository,
  LedgerRepository,
  ListRepository,
  SlugIndex,
  Versioned,
} from '../../application/ports.ts';
import { isActiveEntry, type Entry, type EntryId } from '../../domain/entry.ts';
import type { NominationLedger } from '../../domain/ledger.ts';
import type { List, ListId } from '../../domain/list.ts';

/** A versioned key-value table with the same create/compare-and-set semantics as Blobs. */
class Table<T> {
  private readonly rows = new Map<string, Versioned<T>>();
  private counter = 0;

  get(key: string): Promise<Versioned<T> | null> {
    return Promise.resolve(this.rows.get(key) ?? null);
  }

  save(key: string, value: T, expectedVersion: string | null): Promise<boolean> {
    if ((this.rows.get(key)?.version ?? null) !== expectedVersion) return Promise.resolve(false);
    this.counter += 1;
    this.rows.set(key, { value, version: `v${String(this.counter)}` });
    return Promise.resolve(true);
  }

  delete(key: string): Promise<void> {
    this.rows.delete(key);
    return Promise.resolve();
  }

  values(prefix = ''): T[] {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, row]) => row.value);
  }
}

export class InMemoryListRepository implements ListRepository {
  private readonly table = new Table<List>();
  get = (id: ListId) => this.table.get(id);
  save = (list: List, expectedVersion: string | null) =>
    this.table.save(list.id, list, expectedVersion);
  all = () => Promise.resolve(this.table.values());
}

export class InMemorySlugIndex implements SlugIndex {
  private readonly table = new Table<ListId>();
  lookup = async (slug: string) => (await this.table.get(slug))?.value ?? null;
  claim = (slug: string, id: ListId) => this.table.save(slug, id, null);
  release = (slug: string) => this.table.delete(slug);
}

export class InMemoryEntryRepository implements EntryRepository {
  private readonly table = new Table<Entry>();
  private key = (listId: ListId, entryId: EntryId) => `${listId}/${entryId}`;
  create = (entry: Entry) => this.table.save(this.key(entry.listId, entry.id), entry, null);
  get = (listId: ListId, entryId: EntryId) => this.table.get(this.key(listId, entryId));
  save = (entry: Entry, expectedVersion: string) =>
    this.table.save(this.key(entry.listId, entry.id), entry, expectedVersion);
  forList = (listId: ListId) => Promise.resolve(this.table.values(`${listId}/`));
  idsForList = (listId: ListId) =>
    Promise.resolve(
      this.table
        .values(`${listId}/`)
        .filter(isActiveEntry)
        .map((entry) => entry.id),
    );
}

export class InMemoryLedgerRepository implements LedgerRepository {
  private readonly table = new Table<NominationLedger>();
  private key = (memberId: MemberId, listId: ListId) => `${memberId}/${listId}`;
  get = (memberId: MemberId, listId: ListId) => this.table.get(this.key(memberId, listId));
  save = (ledger: NominationLedger, expectedVersion: string | null) =>
    this.table.save(this.key(ledger.memberId, ledger.listId), ledger, expectedVersion);
  forMember = (memberId: MemberId) => Promise.resolve(this.table.values(`${memberId}/`));
  forList = (listId: ListId) =>
    Promise.resolve(this.table.values().filter((ledger) => ledger.listId === listId));
  delete = (memberId: MemberId, listId: ListId) => this.table.delete(this.key(memberId, listId));
}
