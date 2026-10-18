import {
  ok,
  requireAdmin,
  type Actor,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { BallotListId } from '../domain/ballot.ts';
import type { BallotRepository } from './ports.ts';

export interface ParticipationScope {
  readonly id: string;
  readonly activeEntryIds: readonly string[];
  readonly minVotes: number;
}

export interface VotingParticipation {
  readonly id: string;
  readonly ratings: number;
  readonly voters: number;
  readonly ratedEntries: number;
  readonly readyEntries: number;
  readonly distribution: readonly { readonly ratings: number; readonly entries: number }[];
}

/** Counts participation, never score values. Empty and withdrawal-only ballots do not count. */
export const makeParticipationSummary =
  (deps: { readonly ballots: Pick<BallotRepository, 'forList'> }) =>
  async (
    actor: Actor,
    scope: readonly ParticipationScope[],
  ): Promise<
    Result<{ readonly voters: number; readonly lists: readonly VotingParticipation[] }, DomainError>
  > => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const members = new Set<MemberId>();
    const lists: VotingParticipation[] = [];
    for (let offset = 0; offset < scope.length; offset += 4) {
      const batch = await Promise.all(
        scope.slice(offset, offset + 4).map(async (list) => {
          const counts = new Map(list.activeEntryIds.map((id) => [id, 0]));
          let voters = 0;
          let ratings = 0;
          for (const ballot of await deps.ballots.forList(list.id as BallotListId)) {
            let participating = false;
            for (const id of Object.keys(ballot.scores)) {
              const count = counts.get(id);
              if (count === undefined) continue;
              counts.set(id, count + 1);
              ratings += 1;
              participating = true;
            }
            if (participating) {
              voters += 1;
              members.add(ballot.memberId);
            }
          }
          const distribution = new Map<number, number>();
          let ratedEntries = 0;
          let readyEntries = 0;
          for (const count of counts.values()) {
            if (count > 0) {
              ratedEntries += 1;
              if (count >= list.minVotes) readyEntries += 1;
            }
            distribution.set(count, (distribution.get(count) ?? 0) + 1);
          }
          return {
            id: list.id,
            ratings,
            voters,
            ratedEntries,
            readyEntries,
            distribution: [...distribution]
              .sort(([a], [b]) => a - b)
              .map(([ratings, entries]) => ({ ratings, entries })),
          };
        }),
      );
      lists.push(...batch);
    }
    return ok({ voters: members.size, lists });
  };
