import type { ListsModule } from '../../lists/index.ts';
import type { VotingModule } from '../../voting/index.ts';
import type { ListParticipation, VotingParticipation } from '../application/ports.ts';

export type ListsApi = Pick<ListsModule, 'participationScope'>;
export type VotingApi = Pick<VotingModule, 'participationSummary'>;

export const createListParticipation = (lists: ListsApi): ListParticipation => ({
  scope: (actor, input) => lists.participationScope(actor, input),
});
export const createVotingParticipation = (voting: VotingApi): VotingParticipation => ({
  summarize: (actor, scope) => voting.participationSummary(actor, scope),
});
