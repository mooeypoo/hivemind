import type { Actor, DomainError, Result } from '../../../shared/kernel/index.ts';
import type { ListSummary } from '../domain/insights.ts';

export type ParticipationList = ListSummary &
  (
    | { readonly status: 'after-close'; readonly revealsAt: string | null }
    | { readonly status: 'paused' }
    | {
        readonly status: 'available';
        readonly entries: number;
        readonly withdrawnEntries: number;
        readonly setAsideEntries: number;
        readonly nominators: number;
        readonly minVotes: number;
        readonly activeEntryIds: readonly string[];
      }
  );

export interface ListParticipation {
  scope(
    actor: Actor,
    input: { readonly list?: string },
  ): Promise<
    Result<
      {
        readonly lists: readonly ParticipationList[];
        readonly nominators: number;
      },
      DomainError
    >
  >;
}

export interface VotingParticipation {
  summarize(
    actor: Actor,
    scope: readonly {
      readonly id: string;
      readonly activeEntryIds: readonly string[];
      readonly minVotes: number;
    }[],
  ): Promise<
    Result<
      {
        readonly voters: number;
        readonly lists: readonly {
          readonly id: string;
          readonly ratings: number;
          readonly voters: number;
          readonly ratedEntries: number;
          readonly readyEntries: number;
          readonly distribution: readonly { readonly ratings: number; readonly entries: number }[];
        }[];
      },
      DomainError
    >
  >;
}
