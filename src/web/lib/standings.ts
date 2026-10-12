import type { CatalogItemDto, EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';

export interface StandingRow {
  /** Equal scores share a rank (1, 2, 2, 4). Null until the entry has enough votes. */
  readonly rank: number | null;
  readonly entryId: string;
  readonly item: CatalogItemDto;
  readonly nominatedBy: string | null;
  /** The weighted ranking score; null without votes. */
  readonly score: number | null;
  readonly votes: number;
  /** Fewer votes than the list's minimum: not ranked yet. */
  readonly provisional: boolean;
  readonly votesNeeded: number;
}

export interface Standings {
  /** The first three ranked entries. */
  readonly podium: readonly StandingRow[];
  /** Every other ranked entry, in leaderboard order. */
  readonly rest: readonly StandingRow[];
  /** Entries with votes, but fewer than the list's minimum: not ranked yet, best score first. */
  readonly provisional: readonly StandingRow[];
  /** Entries nobody has rated yet, including any too new to be on the board. */
  readonly unrated: readonly StandingRow[];
}

const PODIUM_SIZE = 3;

/** One view of a leaderboard for both the Standings tab and the results page. */
export const buildStandings = (
  rows: readonly LeaderboardRowDto[],
  entries: readonly EntryDto[],
): Standings => {
  const nominators = new Map(entries.map((entry) => [entry.id, entry.nominatedBy]));
  const toRow = (row: LeaderboardRowDto): StandingRow => ({
    ...row,
    nominatedBy: nominators.get(row.entryId) ?? null,
  });
  const ranked = rows
    .filter((row) => row.rank !== null && !row.provisional && row.votes > 0)
    .map(toRow);
  const provisional = rows
    .filter((row) => row.votes > 0 && (row.provisional || row.rank === null))
    .map(toRow)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const placed = new Set([...ranked, ...provisional].map((row) => row.entryId));
  const unrated = [
    ...rows.filter((row) => !placed.has(row.entryId)).map(toRow),
    ...entries
      .filter((entry) => !rows.some((row) => row.entryId === entry.id))
      .map((entry): StandingRow => ({
        rank: null,
        entryId: entry.id,
        item: entry.item,
        nominatedBy: entry.nominatedBy,
        score: null,
        votes: 0,
        provisional: true,
        votesNeeded: 0,
      })),
  ];
  return {
    podium: ranked.slice(0, PODIUM_SIZE),
    rest: ranked.slice(PODIUM_SIZE),
    provisional,
    unrated,
  };
};

/** Where a score sits on the list's scale, from 0 to 100, for score bars. */
export const scalePercent = (
  score: number,
  scale: { readonly min: number; readonly max: number },
): number => {
  const span = scale.max - scale.min;
  if (span <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, (score - scale.min) / span)) * 100);
};
