import type { BallotListId } from '../domain/ballot.ts';
import type { BallotRepository } from './ports.ts';

/**
 * Every ballot of a list as anonymous score maps, for ranking. Member ids never leave
 * voting: ranking gets the numbers, not who gave them.
 */
export const makeScoresForList =
  (deps: { readonly ballots: BallotRepository }) =>
  async (listId: string): Promise<Readonly<Record<string, number>>[]> =>
    (await deps.ballots.forList(listId as BallotListId)).map((ballot) => ({ ...ballot.scores }));
