import type { MemberActor } from '../../../shared/kernel/index.ts';
import { retainActivityIdentity } from '../domain/activity.ts';
import { nominationToken, type Entry, type EntryId, type ItemSnapshot } from '../domain/entry.ts';
import type { AccessAction, Audience } from '../domain/access.ts';
import {
  allowedFor,
  hiddenFromMembers,
  lifecycleOf,
  nominationsOpen,
  underNominationCap,
  type Lifecycle,
  type List,
  type ListConfig,
  type ListId,
  type Schedule,
  type DraftSchedule,
  viaSiteAdmin,
} from '../domain/list.ts';

/** Who may view, at a glance: every member, members with certain roles, or only site admins. */
export type Viewers = 'everyone' | 'roles' | 'site-admins';

export const viewersOf = (list: List): Viewers =>
  hiddenFromMembers(list)
    ? 'site-admins'
    : list.config.access.view.kind === 'everyone'
      ? 'everyone'
      : 'roles';

export interface ListView extends ListConfig {
  readonly createdBy?: string | null;
  readonly settingsVersion?: number;
  readonly writeRevision: string | null;
  readonly participationPaused: boolean;
  readonly deleting: boolean;
  readonly id: ListId;
  readonly lifecycle: Lifecycle;
  readonly schedule: Schedule | null;
  readonly draftSchedule?: DraftSchedule | null;
  readonly viewers: Viewers;
  /** Site admins only: who could view before the list was limited to site admins. */
  readonly previousView?: Audience | null;
  /** Site admins only: an older version of the app changed access; see the repository. */
  readonly accessNeedsReview?: boolean;
  /** What the caller may do here. */
  readonly viewer: {
    /** What the list's access allows the caller, whatever its lifecycle. */
    readonly allowed: { readonly nominate: boolean; readonly rate: boolean };
    /** Allowed to rate, and the list isn't paused. Lifecycle still decides whether it is open. */
    readonly canRate: boolean;
    readonly canNominate: boolean;
    readonly nominationsUsed: number;
    /** What a site admin may do here only as a site admin. Empty for everyone else. */
    readonly viaSiteAdmin: readonly AccessAction[];
  };
}

export interface EntryView {
  readonly moderation?: { readonly adminName: string | null; readonly at: string } | null;
  readonly setAsideReason: string | null;
  readonly id: EntryId;
  readonly item: ItemSnapshot;
  /** Only when the list shows nominators. */
  readonly nominatedBy: string | null;
  readonly isMine: boolean;
  readonly nominatedAt: Date;
  readonly withdrawalToken: string | null;
  readonly deletionToken: string | null;
}

export interface ListDetail extends ListView {
  readonly withdrawnEntries: readonly EntryView[];
  readonly entryDeletion: List['entryDeletion'];
  readonly itemSourceEditable: boolean;
  readonly entries: readonly EntryView[];
  /** For an archived list whose source limits retention: when item details will be removed. */
  readonly snapshotsExpireAt: Date | null;
}

export const toListView = (
  list: List,
  actor: MemberActor,
  now: Date,
  nominationsUsed: number,
): ListView => {
  const allowed = allowedFor(list, actor);
  const active = list.deletionRequested !== true && list.entryDeletion == null;
  return {
    ...list.config,
    ...(actor.isAdmin
      ? {
          createdBy:
            retainActivityIdentity(list.activity ?? [], now).find(
              (event) => event.action === 'created' || event.action === 'imported',
            )?.admin?.displayName ?? null,
        }
      : {}),
    ...(actor.isAdmin ? { settingsVersion: list.settingsVersion ?? 0 } : {}),
    writeRevision: list.entryDeletionRevision ?? null,
    deleting: list.deletionRequested === true,
    participationPaused: list.entryDeletion != null,
    id: list.id,
    lifecycle: lifecycleOf(list, now),
    schedule: list.schedule,
    ...(actor.isAdmin && list.phase === 'draft'
      ? { draftSchedule: list.draftSchedule ?? null }
      : {}),
    viewers: viewersOf(list),
    ...(actor.isAdmin
      ? {
          previousView: list.previousView ?? null,
          accessNeedsReview: list.accessNeedsReview === true,
        }
      : {}),
    viewer: {
      allowed: { nominate: allowed.nominate, rate: allowed.rate },
      canRate: active && allowed.rate,
      canNominate:
        active &&
        allowed.nominate &&
        nominationsOpen(list, now) &&
        underNominationCap(list, nominationsUsed),
      nominationsUsed,
      viaSiteAdmin: viaSiteAdmin(list, actor),
    },
  };
};

export const toEntryView = (
  entry: Entry,
  list: List,
  actor: MemberActor,
  now: Date,
): EntryView => ({
  ...(actor.isAdmin ? { moderation: latestModeration(entry, now) } : {}),
  setAsideReason: entry.setAsideReason ?? null,
  id: entry.id,
  item: entry.item,
  nominatedBy: list.config.showNominators ? (entry.nominatedBy?.displayName ?? null) : null,
  isMine: entry.nominatedBy?.memberId === actor.memberId,
  nominatedAt: entry.nominatedAt,
  withdrawalToken:
    entry.nominatedBy?.memberId === actor.memberId && nominationsOpen(list, now)
      ? nominationToken(entry)
      : null,
  deletionToken: actor.isAdmin ? nominationToken(entry) : null,
});

const latestModeration = (entry: Entry, now: Date) => {
  const event = retainActivityIdentity(entry.activity ?? [], now).at(-1);
  return event === undefined
    ? null
    : { adminName: event.admin?.displayName ?? null, at: event.at.toISOString() };
};
