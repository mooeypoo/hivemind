export interface ListSummary {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly lifecycle: 'draft' | 'scheduled' | 'open' | 'closed' | 'archived';
  readonly visibility: 'public' | 'hidden';
  readonly source: string;
  readonly entryMode: 'nominations' | 'seeded';
}

export interface ParticipationMetrics {
  readonly entries: number;
  readonly withdrawnEntries: number;
  readonly setAsideEntries: number;
  readonly nominators: number;
  readonly ratings: number;
  readonly voters: number;
  readonly ratedEntries: number;
  readonly readyEntries: number;
}

export type ListInsight = ListSummary &
  (
    | { readonly status: 'after-close'; readonly revealsAt: string | null }
    | { readonly status: 'paused' }
    | {
        readonly status: 'available';
        readonly metrics: ParticipationMetrics;
        readonly minVotes: number;
        readonly distribution: readonly { readonly ratings: number; readonly entries: number }[];
      }
  );

export interface Insights {
  readonly computedAt: string;
  readonly includedLists: number;
  readonly excludedLists: number;
  readonly totals: ParticipationMetrics;
  readonly lists: readonly ListInsight[];
}
