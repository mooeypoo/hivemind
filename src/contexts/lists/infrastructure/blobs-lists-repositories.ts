import type { Store } from '@netlify/blobs';
import type { ActivityEvent } from '../domain/activity.ts';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type {
  EntryRepository,
  LedgerRepository,
  ListRepository,
  SlugIndex,
} from '../application/ports.ts';
import { isActiveEntry, type Entry, type EntryId } from '../domain/entry.ts';
import type { NominationLedger } from '../domain/ledger.ts';
import type { List, ListConfig, ListId, Phase, Schedule } from '../domain/list.ts';
import {
  accessFromLegacy,
  EVERYONE,
  legacyFromAccess,
  onlySiteAdmins,
  SITE_ADMINS_ONLY,
  type Audience,
  type ListAccess,
} from '../domain/access.ts';

/*
 * Store: `lists`. Lists are written as v2 and read from v1 or v2. Keys:
 *   list/{listId}                  the List aggregate
 *   slug/{slug}                    unique slug → listId
 *   entry/{listId}/{entryId}       entries; the id derives from the item, so creation dedupes
 *   nominator/{memberId}/{listId}  a member's nominations per list (cap, export, erasure)
 * Records are versioned (`v: 1`); domain objects are never stored directly.
 *
 * Access: lists stay v2 so a rollback can still read them. `config.access` is the source of truth;
 * versions before it pass unknown config keys through untouched. Every write also sets the old
 * `visibility` and `config.requiredRoleIds` to the closest access that never allows more
 * (`legacyFromAccess`), so older code fails closed. If those fields no longer match `access`
 * when read, older code changed them: the list is limited to site admins for review.
 */

interface ActivityRecord {
  readonly id: string;
  readonly action: ActivityEvent['action'];
  readonly at: string;
  readonly admin: { readonly memberId: string; readonly displayName: string } | null;
  readonly changes: ActivityEvent['changes'];
}
const activityToRecord = (event: ActivityEvent): ActivityRecord => ({
  id: event.id,
  action: event.action,
  at: event.at.toISOString(),
  admin:
    event.admin === null
      ? null
      : { memberId: event.admin.memberId, displayName: event.admin.displayName },
  changes: event.changes,
});
const activityFromRecord = (record: ActivityRecord): ActivityEvent => ({
  id: record.id,
  action: record.action,
  at: new Date(record.at),
  admin:
    record.admin === null
      ? null
      : { memberId: record.admin.memberId as MemberId, displayName: record.admin.displayName },
  changes: record.changes,
});

interface ScheduleRecord {
  readonly opensAt: string;
  readonly nominationsCloseAt: string | null;
  /** Null: open-ended. */
  readonly closesAt: string | null;
}

type AudienceRecord =
  { readonly kind: 'everyone' } | { readonly kind: 'roles'; readonly roleIds: readonly string[] };

interface AccessRecord {
  readonly view: AudienceRecord;
  readonly nominate: AudienceRecord;
  readonly rate: AudienceRecord;
}

type ConfigRecord = Omit<ListConfig, 'access' | 'scoreVisibility'> & {
  /** Older versions' participation roles, kept in step with `access` for rollbacks. */
  readonly requiredRoleIds?: readonly string[];
  readonly scoreVisibility?: ListConfig['scoreVisibility'];
  /** Absent on lists last saved before per-action access. */
  readonly access?: AccessRecord;
};

/** v2: several required roles and an optional nomination cap. */
interface ListRecordV2 {
  readonly activity?: readonly ActivityRecord[];
  readonly v: 2;
  readonly settingsVersion?: number;
  readonly id: string;
  readonly config: ConfigRecord;
  readonly schedule: ScheduleRecord | null;
  readonly draftSchedule?: {
    readonly opensAt: string | null;
    readonly nominationsCloseAt: string | null;
    readonly closesAt: string | null;
  } | null;
  readonly phase: Phase;
  readonly createdAt: string;
  /** Added after v2 shipped; absent on lists archived before it existed. */
  readonly archivedAt?: string | null;
  /** Older versions' visibility, kept in step with `access` for rollbacks; absent means public. */
  readonly visibility?: 'public' | 'hidden';
  readonly previousView?: AudienceRecord | null;
  readonly accessNeedsReview?: boolean;
  readonly entryWriteToken?: string;
  readonly deletionRequested?: boolean;
  readonly entryDeletion?: List['entryDeletion'];
  readonly entryDeletionRevision?: string;
}

/** v1: a single optional required role. Still read; never written. */
interface ListRecordV1 extends Omit<ListRecordV2, 'v' | 'config'> {
  readonly v: 1;
  readonly config: Omit<ConfigRecord, 'requiredRoleIds'> & {
    readonly requiredRoleId: string | null;
  };
}

interface EntryRecordV1 {
  readonly activity?: readonly ActivityRecord[];
  readonly setAsideReason?: string | null;
  readonly v: 1;
  readonly id: string;
  readonly listId: string;
  readonly item: Entry['item'];
  readonly nominatedBy: { readonly memberId: string; readonly displayName: string } | null;
  readonly nominatedAt: string;
  /** Optional: absent on entries written before retention existed. */
  readonly snapshotPurgedAt?: string | null;
  readonly nominationId?: string | null;
  readonly withdrawnAt?: string | null;
  readonly withdrawnNominationIds?: readonly string[];
}

interface LedgerRecordV1 {
  readonly v: 1;
  readonly memberId: string;
  readonly listId: string;
  readonly entryIds: readonly string[];
  readonly claims?: Readonly<Record<string, string>>;
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
        closesAt: schedule.closesAt?.toISOString() ?? null,
      };

const scheduleFromRecord = (record: ScheduleRecord | null): Schedule | null =>
  record === null
    ? null
    : {
        opensAt: new Date(record.opensAt),
        nominationsCloseAt:
          record.nominationsCloseAt === null ? null : new Date(record.nominationsCloseAt),
        closesAt: record.closesAt === null ? null : new Date(record.closesAt),
      };

const listToRecord = (list: List): ListRecordV2 => {
  const { access, ...config } = list.config;
  const legacy = legacyFromAccess(access, config.entryMode === 'seeded');
  return {
    v: 2,
    settingsVersion: list.settingsVersion ?? 0,
    ...(list.activity === undefined ? {} : { activity: list.activity.map(activityToRecord) }),
    id: list.id,
    config: { ...config, requiredRoleIds: legacy.requiredRoleIds, access },
    schedule: scheduleToRecord(list.schedule),
    draftSchedule:
      list.draftSchedule == null
        ? null
        : {
            opensAt: list.draftSchedule.opensAt?.toISOString() ?? null,
            nominationsCloseAt: list.draftSchedule.nominationsCloseAt?.toISOString() ?? null,
            closesAt: list.draftSchedule.closesAt?.toISOString() ?? null,
          },
    phase: list.phase,
    createdAt: list.createdAt.toISOString(),
    archivedAt: list.archivedAt?.toISOString() ?? null,
    visibility: legacy.hidden ? 'hidden' : 'public',
    previousView: list.previousView ?? null,
    ...(list.accessNeedsReview === true ? { accessNeedsReview: true } : {}),
    ...(list.entryWriteToken === undefined ? {} : { entryWriteToken: list.entryWriteToken }),
    ...(list.deletionRequested === undefined ? {} : { deletionRequested: list.deletionRequested }),
    ...(list.entryDeletion === undefined ? {} : { entryDeletion: list.entryDeletion }),
    ...(list.entryDeletionRevision === undefined
      ? {}
      : { entryDeletionRevision: list.entryDeletionRevision }),
  };
};

const sameRoles = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((role) => b.includes(role));

/** Access as stored, or as an older version left it. See the store note at the top. */
const accessFromRecord = (
  record: ListRecordV2,
): {
  readonly access: ListAccess;
  readonly previousView: Audience | null;
  readonly accessNeedsReview: boolean;
} => {
  const hidden = record.visibility === 'hidden';
  const requiredRoleIds = (record.config.requiredRoleIds ?? []) as RoleId[];
  const previousView = (record.previousView ?? null) as Audience | null;
  const stored = record.config.access as ListAccess | undefined;
  if (stored === undefined) {
    return {
      access: accessFromLegacy(requiredRoleIds, hidden),
      previousView: previousView ?? (hidden ? EVERYONE : null),
      accessNeedsReview: false,
    };
  }
  const expected = legacyFromAccess(stored, record.config.entryMode === 'seeded');
  if (expected.hidden === hidden && sameRoles(expected.requiredRoleIds, requiredRoleIds)) {
    return { access: stored, previousView, accessNeedsReview: record.accessNeedsReview === true };
  }
  return {
    access: { ...stored, view: SITE_ADMINS_ONLY },
    previousView: onlySiteAdmins(stored.view) ? previousView : stored.view,
    accessNeedsReview: true,
  };
};

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
  const { access, previousView, accessNeedsReview } = accessFromRecord(record);
  // Spread, not picked: config keys from newer versions survive a rollback to this one.
  const config = Object.fromEntries(
    Object.entries(record.config).filter(([key]) => key !== 'requiredRoleIds' && key !== 'access'),
  ) as Omit<ConfigRecord, 'requiredRoleIds' | 'access'>;
  return {
    id: record.id as ListId,
    settingsVersion: record.settingsVersion ?? 0,
    ...(record.activity === undefined ? {} : { activity: record.activity.map(activityFromRecord) }),
    config: {
      ...config,
      access,
      // Added after v2 shipped: lists stored before it had private scores.
      scoreVisibility: record.config.scoreVisibility ?? 'private',
    },
    schedule: scheduleFromRecord(record.schedule),
    draftSchedule:
      record.draftSchedule == null
        ? null
        : {
            opensAt:
              record.draftSchedule.opensAt === null ? null : new Date(record.draftSchedule.opensAt),
            nominationsCloseAt:
              record.draftSchedule.nominationsCloseAt === null
                ? null
                : new Date(record.draftSchedule.nominationsCloseAt),
            closesAt:
              record.draftSchedule.closesAt === null
                ? null
                : new Date(record.draftSchedule.closesAt),
          },
    phase: record.phase,
    createdAt: new Date(record.createdAt),
    previousView,
    accessNeedsReview,
    archivedAt: record.archivedAt == null ? null : new Date(record.archivedAt),
    ...(record.entryWriteToken === undefined ? {} : { entryWriteToken: record.entryWriteToken }),
    ...(record.deletionRequested === undefined
      ? {}
      : { deletionRequested: record.deletionRequested }),
    ...(record.entryDeletion === undefined ? {} : { entryDeletion: record.entryDeletion }),
    ...(record.entryDeletionRevision === undefined
      ? {}
      : { entryDeletionRevision: record.entryDeletionRevision }),
  };
};

const entryToRecord = (entry: Entry): EntryRecordV1 => ({
  ...(entry.activity === undefined ? {} : { activity: entry.activity.map(activityToRecord) }),
  setAsideReason: entry.setAsideReason ?? null,
  v: 1,
  id: entry.id,
  listId: entry.listId,
  item: entry.item,
  nominatedBy: entry.nominatedBy,
  nominatedAt: entry.nominatedAt.toISOString(),
  snapshotPurgedAt: entry.snapshotPurgedAt?.toISOString() ?? null,
  ...(entry.nominationId === undefined ? {} : { nominationId: entry.nominationId }),
  ...(entry.withdrawnAt === undefined
    ? {}
    : { withdrawnAt: entry.withdrawnAt?.toISOString() ?? null }),
  ...(entry.withdrawnNominationIds === undefined
    ? {}
    : { withdrawnNominationIds: entry.withdrawnNominationIds }),
});

const entryFromRecord = (data: unknown): Entry => {
  assertV1(data, 'entry');
  const record = data as EntryRecordV1;
  return {
    id: record.id as EntryId,
    ...(record.activity === undefined ? {} : { activity: record.activity.map(activityFromRecord) }),
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
    setAsideReason: record.setAsideReason ?? null,
    snapshotPurgedAt: record.snapshotPurgedAt == null ? null : new Date(record.snapshotPurgedAt),
    ...(record.nominationId === undefined ? {} : { nominationId: record.nominationId }),
    ...(record.withdrawnAt === undefined
      ? {}
      : { withdrawnAt: record.withdrawnAt === null ? null : new Date(record.withdrawnAt) }),
    ...(record.withdrawnNominationIds === undefined
      ? {}
      : { withdrawnNominationIds: record.withdrawnNominationIds }),
  };
};

const ledgerFromRecord = (data: unknown): NominationLedger => {
  assertV1(data, 'nominator');
  const record = data as LedgerRecordV1;
  return {
    memberId: record.memberId as MemberId,
    listId: record.listId as ListId,
    entryIds: record.entryIds as EntryId[],
    ...(record.claims === undefined ? {} : { claims: record.claims }),
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

const deletedList = (data: unknown): boolean =>
  typeof data === 'object' &&
  data !== null &&
  'v' in data &&
  data.v === 3 &&
  'deleted' in data &&
  data.deleted === true;

export const createBlobsListRepository = (store: Store): ListRepository => ({
  async get(id) {
    const entry = await readVersioned(store, `list/${id}`);
    return entry === null || deletedList(entry.data)
      ? null
      : { value: listFromRecord(entry.data), version: entry.version };
  },
  save: (list, expectedVersion) =>
    writeVersioned(store, `list/${list.id}`, listToRecord(list), expectedVersion),
  async all() {
    const lists = await readAll(store, 'list/', (data) =>
      deletedList(data) ? null : listFromRecord(data),
    );
    return lists.filter((list) => list !== null);
  },
  async delete(id) {
    // Retaining only a fence prevents delayed creates/updates from resurrecting this ID.
    await store.setJSON(`list/${id}`, { v: 3, deleted: true });
  },
  async beginEntryWrite(id, token) {
    await store.setJSON(`entry-write/${id}/${token}`, { v: 1 });
  },
  endEntryWrite: (id, token) => store.delete(`entry-write/${id}/${token}`),
  async hasEntryWrites(id) {
    const { blobs } = await store.list({ prefix: `entry-write/${id}/` });
    return blobs.length > 0;
  },
});

export const createBlobsSlugIndex = (store: Store): SlugIndex => ({
  async lookup(slug) {
    const data = (await store.get(`slug/${slug}`, { type: 'json' })) as { listId?: string } | null;
    return typeof data?.listId === 'string' ? (data.listId as ListId) : null;
  },
  async claim(slug, id) {
    const current = await readVersioned(store, `slug/${slug}`);
    if (current !== null && (current.data as { listId: unknown }).listId !== null) return false;
    return writeVersioned(store, `slug/${slug}`, { v: 1, listId: id }, current?.version ?? null);
  },
  async release(slug, owner) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await readVersioned(store, `slug/${slug}`);
      if (current === null || (current.data as { listId: unknown }).listId !== owner) return;
      if (await writeVersioned(store, `slug/${slug}`, { v: 1, listId: null }, current.version)) {
        return;
      }
    }
    throw new Error('Slug release conflicted twice; retry the operation.');
  },
});

export const createBlobsEntryRepository = (store: Store): EntryRepository => ({
  delete: (listId, entryId) => store.delete(`entry/${listId}/${entryId}`),
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
    return (await readAll(store, `entry/${listId}/`, entryFromRecord))
      .filter(isActiveEntry)
      .map((entry) => entry.id);
  },
});

export const createBlobsLedgerRepository = (store: Store): LedgerRepository => ({
  get: (memberId, listId) => versioned(store, `nominator/${memberId}/${listId}`, ledgerFromRecord),
  save: (ledger, expectedVersion) =>
    writeVersioned(
      store,
      `nominator/${ledger.memberId}/${ledger.listId}`,
      {
        v: 1,
        memberId: ledger.memberId,
        listId: ledger.listId,
        entryIds: ledger.entryIds,
        ...(ledger.claims === undefined ? {} : { claims: ledger.claims }),
      },
      expectedVersion,
    ),
  forMember: (memberId) => readAll(store, `nominator/${memberId}/`, ledgerFromRecord),
  async forList(listId) {
    // Keys are member-first, so this lists all ledgers and keeps this list's. Backups only.
    const all = await readAll(store, 'nominator/', ledgerFromRecord);
    return all.filter((ledger) => ledger.listId === listId);
  },
  delete: (memberId, listId) => store.delete(`nominator/${memberId}/${listId}`),
});
