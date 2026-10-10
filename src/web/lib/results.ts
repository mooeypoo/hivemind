import type { CatalogItemDto, EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';

export interface ResultRow {
  /** Place among confirmed entries; equal scores share it. Null for the other groups. */
  readonly position: number | null;
  readonly entryId: string;
  readonly item: CatalogItemDto;
  readonly nominatedBy: string | null;
  readonly votes: number;
  readonly average: number | null;
  readonly votesNeeded: number;
}

export interface Results {
  readonly ranked: readonly ResultRow[];
  readonly provisional: readonly ResultRow[];
  readonly unrated: readonly ResultRow[];
}

/**
 * The read-only results: confirmed entries in leaderboard order, numbered among themselves,
 * then provisional ones in leaderboard order, then entries nobody has rated yet.
 */
export const buildResults = (
  rows: readonly LeaderboardRowDto[],
  entries: readonly EntryDto[],
): Results => {
  const nominators = new Map(entries.map((entry) => [entry.id, entry.nominatedBy]));
  const toRow = (row: LeaderboardRowDto, position: number | null): ResultRow => ({
    position,
    entryId: row.entryId,
    item: row.item,
    nominatedBy: nominators.get(row.entryId) ?? null,
    votes: row.votes,
    average: row.average,
    votesNeeded: row.votesNeeded,
  });

  const ranked: ResultRow[] = [];
  const provisional: ResultRow[] = [];
  const unrated: ResultRow[] = [];
  let previous: { rank: number | null; position: number } | null = null;
  for (const row of rows) {
    if (row.votes === 0 || row.rank === null) {
      unrated.push(toRow(row, null));
    } else if (row.provisional) {
      provisional.push(toRow(row, null));
    } else {
      const position: number =
        previous !== null && previous.rank === row.rank ? previous.position : ranked.length + 1;
      previous = { rank: row.rank, position };
      ranked.push(toRow(row, position));
    }
  }

  const onBoard = new Set(rows.map((row) => row.entryId));
  for (const entry of entries) {
    if (onBoard.has(entry.id)) continue;
    unrated.push({
      position: null,
      entryId: entry.id,
      item: entry.item,
      nominatedBy: entry.nominatedBy,
      votes: 0,
      average: null,
      votesNeeded: 0,
    });
  }
  return { ranked, provisional, unrated };
};
