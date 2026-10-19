import type { DomainError, Result, RoleId } from '../../../shared/kernel/index.ts';
import type { ItemSnapshot, Leaderboard } from '../domain/leaderboard.ts';

export interface RankingContext {
  readonly writeRevision?: string | null;
  readonly listId: string;
  readonly resultsVisibility: 'live' | 'after-close';
  /** Voting has ended (closed or archived): final results may be shown. */
  readonly votingEnded: boolean;
  /** When voting is due to end; null when open-ended (or not scheduled). */
  readonly closesAt: Date | null;
  readonly strategy: string;
  readonly minVotes: number;
  /** Current entry ids: cheap to read, used to notice new nominations. */
  readonly entryIds: readonly string[];
  readonly setAsideEntryIds?: readonly string[];
}

/** What ranking reads from lists (upstream). */
export interface ListSource {
  withWrite<T>(
    listId: string,
    work: () => Promise<Result<T, DomainError>>,
    revision?: string | null,
  ): Promise<Result<T, DomainError>>;
  /** By id or slug. Not found for drafts. */
  /** Not found for drafts and hidden lists, unless the viewer is an Admin. */
  context(
    list: string,
    viewer: { readonly isAdmin: boolean; readonly roleIds: readonly RoleId[] },
  ): Promise<Result<RankingContext, DomainError>>;
  entries(listId: string): Promise<readonly { readonly id: string; readonly item: ItemSnapshot }[]>;
}

/** What ranking reads from voting (upstream): every ballot of a list, without member ids. */
export interface ScoreSource {
  scoresForList(listId: string): Promise<readonly Readonly<Record<string, number>>[]>;
}

/** The `ranking` store. Derived data: last write wins. */
export interface LeaderboardCache {
  get(listId: string): Promise<Leaderboard | null>;
  put(board: Leaderboard): Promise<void>;
  /** When each cached board was computed, for clearing out old ones. */
  computedTimes(): Promise<{ readonly listId: string; readonly computedAt: Date }[]>;
  delete(listId: string): Promise<void>;
}
