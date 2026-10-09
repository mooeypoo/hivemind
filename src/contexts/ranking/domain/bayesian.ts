/** What a strategy needs: the entries, every ballot (anonymous) and the list's minimum votes. */
export interface RankingInput {
  readonly entries: readonly { readonly id: string; readonly title: string }[];
  /** One score map per ballot: entry id → score. No member ids. */
  readonly ballots: readonly Readonly<Record<string, number>>[];
  readonly minVotes: number;
}

export interface RankedRow {
  readonly entryId: string;
  /** Null when the entry has no votes yet. Equal scores share a rank. */
  readonly rank: number | null;
  readonly score: number | null;
  readonly mean: number | null;
  readonly votes: number;
  /** Fewer votes than the list's minimum: shown in place, but not yet confirmed. */
  readonly provisional: boolean;
  readonly votesNeeded: number;
}

/**
 * The default strategy, a Bayesian average: (v/(v+m))·R + (m/(v+m))·C, where v is the
 * entry's vote count, R its mean, m the list's `minVotes` and C the mean of every score
 * in the list. Entries without votes are unranked and listed last.
 */
export const bayesian = ({ entries, ballots, minVotes: m }: RankingInput): RankedRow[] => {
  const known = new Set(entries.map((entry) => entry.id));
  const totals = new Map<string, { sum: number; votes: number }>();
  let sum = 0;
  let count = 0;
  for (const ballot of ballots) {
    for (const [entryId, score] of Object.entries(ballot)) {
      if (!known.has(entryId)) continue;
      const total = totals.get(entryId) ?? { sum: 0, votes: 0 };
      totals.set(entryId, { sum: total.sum + score, votes: total.votes + 1 });
      sum += score;
      count += 1;
    }
  }
  const C = count === 0 ? 0 : sum / count;

  const rows = entries.map((entry) => {
    const total = totals.get(entry.id);
    const v = total?.votes ?? 0;
    const R = total === undefined ? null : total.sum / total.votes;
    return {
      entry,
      votes: v,
      mean: R,
      score: R === null ? null : (v / (v + m)) * R + (m / (v + m)) * C,
      provisional: v < m,
      votesNeeded: Math.max(0, m - v),
    };
  });

  rows.sort(
    (a, b) =>
      (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
      b.votes - a.votes ||
      a.entry.title.localeCompare(b.entry.title),
  );

  let previous: { score: number; rank: number } | null = null;
  return rows.map((row, index) => {
    let rank: number | null = null;
    if (row.score !== null) {
      // Equal within floating-point noise counts as a tie.
      rank =
        previous !== null && Math.abs(previous.score - row.score) < 1e-9
          ? previous.rank
          : index + 1;
      previous = { score: row.score, rank };
    }
    return {
      entryId: row.entry.id,
      rank,
      score: row.score,
      mean: row.mean,
      votes: row.votes,
      provisional: row.provisional,
      votesNeeded: row.votesNeeded,
    };
  });
};
