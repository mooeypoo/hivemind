import type { DomainError, MemberId, Result, RoleId } from '../../../shared/kernel/index.ts';
import type { Ballot, BallotEntryId, BallotListId, Scale } from '../domain/ballot.ts';

export interface ListVotingRules {
  readonly listId: BallotListId;
  readonly isOpen: boolean;
  readonly scale: Scale;
  readonly requiredRoleIds: readonly RoleId[];
  /** Public scores may be shown now (the list's scores are public and its results visible). */
  readonly scoresPublic: boolean;
  /** The list's scores are public at all: keep voters' names with their scores. */
  readonly namesWithScores: boolean;
}

/** What voting asks lists (upstream). Implemented over the lists module in infrastructure. */
export interface ListReader {
  withWrite<T>(
    listId: string,
    work: () => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>>;
  /** By list id or slug. Not found for drafts and hidden lists, unless the viewer is an Admin. */
  rulesFor(
    list: string,
    viewer: { readonly isAdmin: boolean },
  ): Promise<Result<ListVotingRules, DomainError>>;
  entryExists(listId: BallotListId, entryId: BallotEntryId): Promise<boolean>;
}

export interface VersionedBallot {
  readonly ballot: Ballot;
  readonly version: string;
}

export interface BallotRepository {
  get(listId: BallotListId, memberId: MemberId): Promise<VersionedBallot | null>;
  /** Creates when `expectedVersion` is null, otherwise updates only if unchanged. */
  save(ballot: Ballot, expectedVersion: string | null): Promise<boolean>;
  delete(listId: BallotListId, memberId: MemberId): Promise<void>;
  /** Every ballot in a list (for ranking). */
  forList(listId: BallotListId): Promise<Ballot[]>;
  /** Every ballot of a member (for export and erasure). */
  forMember(memberId: MemberId): Promise<Ballot[]>;
}
