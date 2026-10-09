import type { ListId, ListsModule } from '../../lists/index.ts';
import type { VotingModule } from '../../voting/index.ts';
import type { ListSource, ScoreSource } from '../application/ports.ts';

/** What ranking needs from the lists and voting modules' public interfaces. */
export type ListsApi = Pick<ListsModule, 'rankingContext' | 'entriesForRanking'>;
export type VotingApi = Pick<VotingModule, 'scoresForList'>;

export const createListSource = (lists: ListsApi): ListSource => ({
  context: (list, viewer) => lists.rankingContext(list, viewer),
  entries: (listId) => lists.entriesForRanking(listId as ListId),
});

export const createScoreSource = (voting: VotingApi): ScoreSource => ({
  scoresForList: (listId) => voting.scoresForList(listId),
});
