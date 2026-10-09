import type { Ballot } from '../domain/ballot.ts';

/** The caller's own scores. There is deliberately no view of anyone else's. */
export interface MyBallot {
  readonly listId: string;
  readonly scores: Readonly<Record<string, number>>;
}

export const toMyBallot = (ballot: Ballot): MyBallot => ({
  listId: ballot.listId,
  scores: ballot.scores,
});
