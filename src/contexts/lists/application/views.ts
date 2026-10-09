import type { MemberActor } from '../../../shared/kernel/index.ts';
import type { Entry, EntryId, ItemSnapshot } from '../domain/entry.ts';
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
} from '../domain/list.ts';

export interface ListView extends ListConfig {
  readonly id: ListId;
  readonly lifecycle: Lifecycle;
  readonly schedule: Schedule | null;
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
    viewer: {
      canParticipate,
      canNominate:
        canParticipate && nominationsOpen(list, now) && underNominationCap(list, nominationsUsed),
      nominationsUsed,
    },
  };
};

export const toEntryView = (entry: Entry, list: List, actor: MemberActor): EntryView => ({
  id: entry.id,
  item: entry.item,
  nominatedBy: list.config.showNominators ? (entry.nominatedBy?.displayName ?? null) : null,
  isMine: entry.nominatedBy?.memberId === actor.memberId,
  nominatedAt: entry.nominatedAt,
});
