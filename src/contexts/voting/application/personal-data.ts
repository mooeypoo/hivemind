import { ok, type DomainError, type MemberId, type Result } from '../../../shared/kernel/index.ts';
import type { BallotRepository } from './ports.ts';

/** Voting's part of "my data": export every ballot; erasure deletes them. */
export const makeVotingPersonalData = (deps: { readonly ballots: BallotRepository }) => ({
  context: 'voting',

  async exportFor(memberId: MemberId) {
    const ballots = await deps.ballots.forMember(memberId);
    return { ballots: ballots.map(({ listId, scores }) => ({ listId, scores })) };
  },

  async eraseFor(memberId: MemberId): Promise<Result<void, DomainError>> {
    for (const ballot of await deps.ballots.forMember(memberId)) {
      await deps.ballots.delete(ballot.listId, memberId);
    }
    return ok(undefined);
  },
});
