import {
  domainError,
  err,
  ok,
  type Clock,
  type DomainError,
  type IdGenerator,
  type MemberId,
  type MemberActor,
  type Result,
  type RoleId,
} from '../../../shared/kernel/index.ts';
import { appendListActivity } from '../domain/list-activity.ts';
import {
  entryIdFor,
  validateSetAsideReason,
  isActiveEntry,
  type Entry,
  type EntryId,
  type ItemSnapshot,
} from '../domain/entry.ts';
import {
  validateConfig,
  validateDraftSchedule,
  type ItemSourceRef,
  type List,
  type ListConfig,
  type ListId,
  type Phase,
} from '../domain/list.ts';
import {
  accessFromLegacy,
  legacyFromAccess,
  onlySiteAdmins,
  SITE_ADMINS_ONLY,
  type Audience,
  type ListAccess,
} from '../domain/access.ts';
import type { EntryRepository, LedgerRepository, ListRepository, SlugIndex } from './ports.ts';
import { listsErrors } from '../domain/errors.ts';

/** A list as stored in a backup file: plain JSON, dates as ISO strings. */
export interface ListBackup {
  readonly list: {
    /**
     * `access` is absent from files made before per-action access. `requiredRoleIds` and
     * `visibility` are still written, fail-closed, for older versions of the app to import.
     */
    readonly config: Omit<ListConfig, 'access'> & {
      readonly access?: ListAccess;
      readonly requiredRoleIds?: readonly string[];
    };
    readonly schedule: {
      readonly opensAt: string;
      readonly nominationsCloseAt: string | null;
      readonly closesAt: string | null;
    } | null;
    readonly draftSchedule?: {
      readonly opensAt: string | null;
      readonly nominationsCloseAt: string | null;
      readonly closesAt: string | null;
    } | null;
    readonly phase: Phase;
    readonly visibility?: 'public' | 'hidden';
    readonly createdAt: string;
    readonly archivedAt: string | null;
  };
  readonly entries: readonly {
    readonly setAsideReason?: string | null;
    readonly item: ItemSnapshot;
    readonly nominatedBy: { readonly memberId: string; readonly displayName: string } | null;
    readonly nominatedAt: string;
    readonly snapshotPurgedAt: string | null;
    readonly withdrawnAt?: string | null;
  }[];
  readonly nominators: readonly {
    readonly memberId: string;
    readonly entryIds: readonly string[];
  }[];
}

export interface RestoredList {
  readonly listId: ListId;
  readonly title: string;
  readonly slug: string;
  /** The original address was taken: restored under a new one, hidden for review. */
  readonly renamed: boolean;
  readonly hidden: boolean;
  readonly entries: number;
  /** Members whose personal data was left out (erased, or the backup key didn't match). */
  readonly membersLeftOut: readonly string[];
}

interface BackupDeps {
  readonly lists: ListRepository;
  readonly slugs: SlugIndex;
  readonly entries: EntryRepository;
  readonly ledgers: LedgerRepository;
}

const iso = (date: Date | null): string | null => date?.toISOString() ?? null;

const toBackup = async (deps: BackupDeps, list: List): Promise<ListBackup> => {
  const [entries, ledgers] = await Promise.all([
    deps.entries.forList(list.id),
    deps.ledgers.forList(list.id),
  ]);
  const legacy = legacyFromAccess(list.config.access, list.config.entryMode === 'seeded');
  return {
    list: {
      config: { ...list.config, requiredRoleIds: legacy.requiredRoleIds },
      draftSchedule:
        list.phase !== 'draft' || list.draftSchedule == null
          ? null
          : {
              opensAt: iso(list.draftSchedule.opensAt),
              nominationsCloseAt: iso(list.draftSchedule.nominationsCloseAt),
              closesAt: iso(list.draftSchedule.closesAt),
            },
      schedule:
        list.schedule === null
          ? null
          : {
              opensAt: list.schedule.opensAt.toISOString(),
              nominationsCloseAt: iso(list.schedule.nominationsCloseAt),
              closesAt: iso(list.schedule.closesAt),
            },
      phase: list.phase,
      visibility: legacy.hidden ? 'hidden' : 'public',
      createdAt: list.createdAt.toISOString(),
      archivedAt: iso(list.archivedAt),
    },
    entries: entries.map((entry) => ({
      setAsideReason: entry.setAsideReason ?? null,
      item: entry.item,
      nominatedBy: entry.nominatedBy,
      nominatedAt: entry.nominatedAt.toISOString(),
      snapshotPurgedAt: iso(entry.snapshotPurgedAt),
      withdrawnAt: iso(entry.withdrawnAt ?? null),
    })),
    nominators: ledgers
      .map((ledger) => ({
        memberId: ledger.memberId,
        entryIds: ledger.entryIds.filter((id) =>
          entries.some(
            (entry) =>
              entry.id === id &&
              isActiveEntry(entry) &&
              entry.nominatedBy?.memberId === ledger.memberId,
          ),
        ),
      }))
      .filter((ledger) => ledger.entryIds.length > 0),
  };
};

const notFound = domainError('not-found', 'lists.not-found', 'That list does not exist.');

/**
 * Lists for a backup: one (by id or slug, drafts and hidden lists included) or all.
 * A service for the backup context, which authorizes the Admin.
 */
export const makeExportForBackup =
  (deps: BackupDeps) =>
  async (
    ref: string | null,
  ): Promise<
    Result<readonly { readonly listId: ListId; readonly backup: ListBackup }[], DomainError>
  > => {
    let lists: List[];
    if (ref === null) {
      lists = (await deps.lists.all()).filter(
        (list) => list.deletionRequested !== true && list.entryDeletion == null,
      );
    } else {
      const byId = await deps.lists.get(ref as ListId);
      const id = byId === null ? await deps.slugs.lookup(ref) : null;
      const found = byId ?? (id === null ? null : await deps.lists.get(id));
      if (found === null) return err(notFound);
      if (found.value.deletionRequested === true) return err(listsErrors.deleting);
      if (found.value.entryDeletion != null) return err(listsErrors.entryDeletionBusy);
      lists = [found.value];
    }
    lists.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return ok(
      await Promise.all(
        lists.map(async (list) => ({ listId: list.id, backup: await toBackup(deps, list) })),
      ),
    );
  };

const invalidBackup = (details: readonly string[]) =>
  domainError('invalid', 'lists.invalid-backup', 'A list in the backup is not valid.', details);

/** The first free address: the original, else `-2`, `-3`… */
const claimFreeSlug = async (
  slugs: SlugIndex,
  wanted: string,
  id: ListId,
): Promise<string | null> => {
  for (let n = 1; n <= 99; n += 1) {
    const candidate = n === 1 ? wanted : `${wanted.slice(0, 56)}-${String(n)}`;
    if (await slugs.claim(candidate, id)) return candidate;
  }
  return null;
};

/**
 * Restores a list from a backup as a new list: never overwrites. Personal data (nominator
 * names and ids, nomination records) is kept only for members `keepMember` accepts.
 * The config is checked again; the schedule is history, so past dates are fine.
 */
export const makeRestoreFromBackup =
  (deps: BackupDeps & { readonly ids: IdGenerator; readonly clock: Clock }) =>
  async (
    backup: ListBackup,
    options: {
      readonly importedBy?: MemberActor;
      /** Replaces the item source, e.g. a preset restored under a new id. */
      readonly itemSource?: ItemSourceRef;
      readonly keepMember: (memberId: string) => Promise<boolean>;
    },
  ): Promise<Result<RestoredList, DomainError>> => {
    const { requiredRoleIds, access: savedAccess, ...savedConfig } = backup.list.config;
    const fileAccess =
      savedAccess ??
      accessFromLegacy((requiredRoleIds ?? []) as RoleId[], backup.list.visibility === 'hidden');
    const config = validateConfig({
      ...savedConfig,
      access: fileAccess,
      ...(options.itemSource === undefined ? {} : { itemSource: options.itemSource }),
    });
    if (!config.ok) return err(invalidBackup(config.error.details ?? [config.error.message]));
    if (backup.list.phase !== 'draft' && backup.list.schedule === null) {
      return err(invalidBackup(['a published or archived list needs a schedule']));
    }
    for (const entry of backup.entries) {
      const reason = validateSetAsideReason(entry.setAsideReason ?? null);
      if (!reason.ok) return err(invalidBackup([reason.error.message]));
    }

    const plan = backup.list.draftSchedule;
    const draftSchedule =
      plan == null
        ? null
        : {
            opensAt: plan.opensAt === null ? null : new Date(plan.opensAt),
            nominationsCloseAt:
              plan.nominationsCloseAt === null ? null : new Date(plan.nominationsCloseAt),
            closesAt: plan.closesAt === null ? null : new Date(plan.closesAt),
          };
    if (draftSchedule !== null) {
      const valid = validateDraftSchedule(draftSchedule);
      if (!valid.ok) return err(invalidBackup(valid.error.details ?? [valid.error.message]));
    }
    const id = deps.ids.next() as ListId;
    const slug = await claimFreeSlug(deps.slugs, config.value.slug, id);
    if (slug === null) return err(invalidBackup(['no free address for this list']));
    const renamed = slug !== config.value.slug;
    const schedule = backup.list.schedule;
    // A copy under a new address, or one limited to roles (which may mean something else on
    // this server), arrives viewable by site admins only, for review.
    const hide = renamed || (fileAccess.view.kind === 'roles' && !onlySiteAdmins(fileAccess.view));
    const access: ListAccess = hide
      ? { ...config.value.access, view: SITE_ADMINS_ONLY }
      : config.value.access;
    const previousView: Audience | null =
      onlySiteAdmins(access.view) && !onlySiteAdmins(fileAccess.view) ? fileAccess.view : null;
    const restored: List = {
      id,
      config: { ...config.value, slug, access },
      previousView,
      draftSchedule: backup.list.phase === 'draft' ? draftSchedule : null,
      schedule:
        schedule === null
          ? null
          : {
              opensAt: new Date(schedule.opensAt),
              nominationsCloseAt:
                schedule.nominationsCloseAt === null ? null : new Date(schedule.nominationsCloseAt),
              closesAt: schedule.closesAt === null ? null : new Date(schedule.closesAt),
            },
      phase: backup.list.phase,
      createdAt: new Date(backup.list.createdAt),
      archivedAt: backup.list.archivedAt === null ? null : new Date(backup.list.archivedAt),
    };
    const list =
      options.importedBy === undefined
        ? restored
        : appendListActivity(restored, 'imported', options.importedBy, deps.clock.now());
    const writeToken = deps.ids.next();
    let completed = false;
    try {
      await deps.lists.beginEntryWrite(id, writeToken);
      if (!(await deps.lists.save(list, null))) {
        await deps.slugs.release(slug, id);
        completed = true;
        return err(invalidBackup(['the list could not be saved']));
      }

      const kept = new Map<string, boolean>();
      const keep = async (memberId: string) => {
        const known = kept.get(memberId);
        if (known !== undefined) return known;
        const decision = await options.keepMember(memberId);
        kept.set(memberId, decision);
        return decision;
      };

      const entryIds = new Set<EntryId>();
      for (const saved of backup.entries) {
        const nominator = saved.nominatedBy;
        const entry: Entry = {
          setAsideReason: saved.setAsideReason?.trim() ?? null,
          id: entryIdFor(saved.item),
          listId: id,
          item: saved.item,
          nominatedBy:
            nominator !== null && (await keep(nominator.memberId))
              ? { memberId: nominator.memberId as MemberId, displayName: nominator.displayName }
              : null,
          nominatedAt: new Date(saved.nominatedAt),
          snapshotPurgedAt:
            saved.snapshotPurgedAt === null ? null : new Date(saved.snapshotPurgedAt),
          withdrawnAt: saved.withdrawnAt == null ? null : new Date(saved.withdrawnAt),
        };
        if (await deps.entries.create(entry)) entryIds.add(entry.id);
      }
      for (const ledger of backup.nominators) {
        if (!(await keep(ledger.memberId))) continue;
        await deps.ledgers.save(
          {
            memberId: ledger.memberId as MemberId,
            listId: id,
            entryIds: ledger.entryIds.filter((entryId) =>
              entryIds.has(entryId as EntryId),
            ) as EntryId[],
          },
          null,
        );
      }

      completed = true;
      return ok({
        listId: id,
        title: list.config.title,
        slug,
        renamed,
        hidden: onlySiteAdmins(list.config.access.view),
        entries: entryIds.size,
        membersLeftOut: [...kept].filter(([, isKept]) => !isKept).map(([memberId]) => memberId),
      });
    } finally {
      if (completed) await deps.lists.endEntryWrite(id, writeToken);
    }
  };
