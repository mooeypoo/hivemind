import type { Store } from '@netlify/blobs';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type {
  EntryRepository,
  LedgerRepository,
  ListRepository,
  SlugIndex,
} from '../application/ports.ts';
import type { Entry, EntryId } from '../domain/entry.ts';
import type { NominationLedger } from '../domain/ledger.ts';
import type { List, ListConfig, ListId, Phase, Schedule } from '../domain/list.ts';

/*
 * Store: `lists`. Lists are written as v2 and read from v1 or v2. Keys:
 *   list/{listId}                  the List aggregate
 *   slug/{slug}                    unique slug → listId
 *   entry/{listId}/{entryId}       entries; the id derives from the item, so creation dedupes
 *   nominator/{memberId}/{listId}  a member's nominations per list (cap, export, erasure)
 * Records are versioned (`v: 1`); domain objects are never stored directly.
 */

interface ScheduleRecord {
  readonly opensAt: string;
  readonly nominationsCloseAt: string | null;
  readonly closesAt: string;
}

type ConfigRecord = Omit<ListConfig, 'requiredRoleIds'> & {
  readonly requiredRoleIds: readonly string[];
};

/** v2: several required roles and an optional nomination cap. */
interface ListRecordV2 {
  readonly v: 2;
  readonly id: string;
  readonly config: ConfigRecord;
  readonly schedule: ScheduleRecord | null;
  readonly phase: Phase;
  readonly createdAt: string;
}

/** v1: a single optional required role. Still read; never written. */
interface ListRecordV1 extends Omit<ListRecordV2, 'v' | 'config'> {
  readonly v: 1;
  readonly config: Omit<ConfigRecord, 'requiredRoleIds'> & {
    readonly requiredRoleId: string | null;
  };
}

interface EntryRecordV1 {
  readonly v: 1;
  readonly id: string;
  readonly listId: string;
  readonly item: Entry['item'];
  readonly nominatedBy: { readonly memberId: string; readonly displayName: string } | null;
  readonly nominatedAt: string;
}

interface LedgerRecordV1 {
  readonly v: 1;
  readonly memberId: string;
  readonly listId: string;
  readonly entryIds: readonly string[];
}

/** Records this version can read. A newer or corrupt record is a deployment error, not user input. */
const assertV1 = (data: unknown, what: string): void => {
  if ((data as { v?: unknown } | null)?.v !== 1) throw new Error(`Unreadable ${what} record`);
};

const scheduleToRecord = (schedule: Schedule | null): ScheduleRecord | null =>
  schedule === null
    ? null
    : {
        opensAt: schedule.opensAt.toISOString(),
        nominationsCloseAt: schedule.nominationsCloseAt?.toISOString() ?? null,
        closesAt: schedule.closesAt.toISOString(),
      };

const scheduleFromRecord = (record: ScheduleRecord | null): Schedule | null =>
  record === null
    ? null
    : {
        opensAt: new Date(record.opensAt),
        nominationsCloseAt:
          record.nominationsCloseAt === null ? null : new Date(record.nominationsCloseAt),
        closesAt: new Date(record.closesAt),
      };

const listToRecord = (list: List): ListRecordV2 => ({
  v: 2,
  id: list.id,
  config: list.config,
  schedule: scheduleToRecord(list.schedule),
  phase: list.phase,
  createdAt: list.createdAt.toISOString(),
});

const upgradeList = (data: unknown): ListRecordV2 => {
  const version = (data as { v?: unknown } | null)?.v;
  if (version === 2) return data as ListRecordV2;
  assertV1(data, 'list');
  const { config, ...rest } = data as ListRecordV1;
  const { requiredRoleId, ...configRest } = config;
  return {
    ...rest,
    v: 2,
    config: { ...configRest, requiredRoleIds: requiredRoleId === null ? [] : [requiredRoleId] },
  };
};

const listFromRecord = (data: unknown): List => {
  const record = upgradeList(data);
  return {
    id: record.id as ListId,
    config: { ...record.config, requiredRoleIds: record.config.requiredRoleIds as RoleId[] },
    schedule: scheduleFromRecord(record.schedule),
    phase: record.phase,
    createdAt: new Date(record.createdAt),
  };
};

const entryToRecord = (entry: Entry): EntryRecordV1 => ({
  v: 1,
  id: entry.id,
  listId: entry.listId,
  item: entry.item,
  nominatedBy: entry.nominatedBy,
  nominatedAt: entry.nominatedAt.toISOString(),
});

const entryFromRecord = (data: unknown): Entry => {
  assertV1(data, 'entry');
  const record = data as EntryRecordV1;
  return {
    id: record.id as EntryId,
    listId: record.listId as ListId,
    item: record.item,
    nominatedBy:
      record.nominatedBy === null
        ? null
        : {
            memberId: record.nominatedBy.memberId as MemberId,
            displayName: record.nominatedBy.displayName,
          },
    nominatedAt: new Date(record.nominatedAt),
  };
};

const ledgerFromRecord = (data: unknown): NominationLedger => {
  assertV1(data, 'nominator');
  const record = data as LedgerRecordV1;
  return {
    memberId: record.memberId as MemberId,
    listId: record.listId as ListId,
    entryIds: record.entryIds as EntryId[],
  };
};

/** Reads every JSON value under a prefix. */
const readAll = async <T>(
  store: Store,
  prefix: string,
  map: (data: unknown) => T,
): Promise<T[]> => {
  const { blobs } = await store.list({ prefix });
  const values = await Promise.all(blobs.map((blob) => store.get(blob.key, { type: 'json' })));
  return values.filter((value) => value !== null).map(map);
};

const versioned = async <T>(store: Store, key: string, map: (data: unknown) => T) => {
  const entry = await readVersioned(store, key);
  return entry === null ? null : { value: map(entry.data), version: entry.version };
};

export const createBlobsListRepository = (store: Store): ListRepository => ({
  get: (id) => versioned(store, `list/${id}`, listFromRecord),
  save: (list, expectedVersion) =>
    writeVersioned(store, `list/${list.id}`, listToRecord(list), expectedVersion),
  all: () => readAll(store, 'list/', listFromRecord),
});

export const createBlobsSlugIndex = (store: Store): SlugIndex => ({
  async lookup(slug) {
    const data = (await store.get(`slug/${slug}`, { type: 'json' })) as { listId?: string } | null;
    return typeof data?.listId === 'string' ? (data.listId as ListId) : null;
  },
  claim: (slug, id) => writeVersioned(store, `slug/${slug}`, { v: 1, listId: id }, null),
  release: (slug) => store.delete(`slug/${slug}`),
});

export const createBlobsEntryRepository = (store: Store): EntryRepository => ({
  create: (entry) =>
    writeVersioned(store, `entry/${entry.listId}/${entry.id}`, entryToRecord(entry), null),
  get: (listId, entryId) => versioned(store, `entry/${listId}/${entryId}`, entryFromRecord),
  save: (entry, expectedVersion) =>
    writeVersioned(
      store,
      `entry/${entry.listId}/${entry.id}`,
      entryToRecord(entry),
      expectedVersion,
    ),
  forList: (listId) => readAll(store, `entry/${listId}/`, entryFromRecord),
  async idsForList(listId) {
    const prefix = `entry/${listId}/`;
    const { blobs } = await store.list({ prefix });
    return blobs.map((blob) => blob.key.slice(prefix.length) as EntryId);
  },
});

export const createBlobsLedgerRepository = (store: Store): LedgerRepository => ({
  get: (memberId, listId) => versioned(store, `nominator/${memberId}/${listId}`, ledgerFromRecord),
  save: (ledger, expectedVersion) =>
    writeVersioned(
      store,
      `nominator/${ledger.memberId}/${ledger.listId}`,
      { v: 1, memberId: ledger.memberId, listId: ledger.listId, entryIds: ledger.entryIds },
      expectedVersion,
    ),
  forMember: (memberId) => readAll(store, `nominator/${memberId}/`, ledgerFromRecord),
  delete: (memberId, listId) => store.delete(`nominator/${memberId}/${listId}`),
});
