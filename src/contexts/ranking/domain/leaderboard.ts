import type { RankedRow } from './bayesian.ts';

export const LEADERBOARD_TTL_SECONDS = 120;

export interface ItemSnapshot {
  readonly source: string;
  readonly externalId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
}

export interface LeaderboardRow extends RankedRow {
  readonly item: ItemSnapshot;
}

/** A list's ranking at a moment. Holds aggregates only: no member ids. */
export interface Leaderboard {
  readonly listId: string;
  readonly computedAt: Date;
  /** The entries it was built from, sorted, to notice new nominations. */
  readonly entryIds: readonly string[];
  readonly rows: readonly LeaderboardRow[];
}

const sameEntries = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/**
 * AGENTS.md: rebuilt when the TTL expires or a new entry is nominated. Scores alone
 * do not invalidate it.
 */
export const isFresh = (
  board: Leaderboard,
  currentEntryIds: readonly string[],
  now: Date,
): boolean =>
  now.getTime() - board.computedAt.getTime() < LEADERBOARD_TTL_SECONDS * 1000 &&
  sameEntries(board.entryIds, [...currentEntryIds].sort());
