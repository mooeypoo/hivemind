import type { MemberActor } from '../../../shared/kernel/index.ts';
import { nominationToken, type Entry, type EntryId, type ItemSnapshot } from '../domain/entry.ts';
import {
  lifecycleOf,
  mayParticipate,
  nominationsOpen,
  underNominationCap,
  type Lifecycle,
  type List,
  type ListConfig,
  type ListId,
  type Schedule,
  type Visibility,
} from '../domain/list.ts';

export interface ListView extends ListConfig {
  readonly id: ListId;
  readonly lifecycle: Lifecycle;
  readonly schedule: Schedule | null;
  readonly visibility: Visibility;
  /** What the caller may do here. */
  readonly viewer: {
    readonly canParticipate: boolean;
    readonly canNominate: boolean;
    readonly nominationsUsed: number;
  };
}

export interface EntryView {
  readonly id: EntryId;
  readonly item: ItemSnapshot;
  /** Only when the list shows nominators. */
  readonly nominatedBy: string | null;
  readonly isMine: boolean;
  readonly nominatedAt: Date;
  readonly withdrawalToken: string | null;
}

export interface ListDetail extends ListView {
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
  const canParticipate = mayParticipate(list, actor.roleIds);
  return {
    ...list.config,
    id: list.id,
    lifecycle: lifecycleOf(list, now),
    schedule: list.schedule,
    visibility: list.visibility,
    viewer: {
      canParticipate,
      canNominate:
        canParticipate && nominationsOpen(list, now) && underNominationCap(list, nominationsUsed),
      nominationsUsed,
    },
  };
};

export const toEntryView = (
  entry: Entry,
  list: List,
  actor: MemberActor,
  now: Date,
): EntryView => ({
  id: entry.id,
  item: entry.item,
  nominatedBy: list.config.showNominators ? (entry.nominatedBy?.displayName ?? null) : null,
  isMine: entry.nominatedBy?.memberId === actor.memberId,
  nominatedAt: entry.nominatedAt,
  withdrawalToken:
    entry.nominatedBy?.memberId === actor.memberId && nominationsOpen(list, now)
      ? nominationToken(entry)
      : null,
});
