import type { DomainError, Result } from '../../../shared/kernel/index.ts';
import type { ItemSnapshot, Leaderboard } from '../domain/leaderboard.ts';

export interface RankingContext {
  readonly listId: string;
  readonly resultsVisibility: 'live' | 'after-close';
  /** Null before the list is scheduled. */
  readonly closesAt: Date | null;
  readonly strategy: string;
  readonly minVotes: number;
  /** Current entry ids: cheap to read, used to notice new nominations. */
  readonly entryIds: readonly string[];
}

/** What ranking reads from lists (upstream). */
export interface ListSource {
  /** By id or slug. Not found for drafts. */
  context(list: string): Promise<Result<RankingContext, DomainError>>;
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
