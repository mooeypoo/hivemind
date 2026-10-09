import type { Store } from '@netlify/blobs';
import { makeChangeScore } from './application/change-score.ts';
import { makeGetMyBallot } from './application/get-my-ballot.ts';
import { makeVotingPersonalData } from './application/personal-data.ts';
import { createBlobsBallotRepository } from './infrastructure/blobs-ballot-repository.ts';
import { createListReader, type ListsApi } from './infrastructure/lists-reader.ts';

export interface VotingModuleDeps {
  /** The `voting` Blobs store. */
  readonly store: Store;
  /** The lists module's public interface (upstream). */
  readonly lists: ListsApi;
}

export const createVotingModule = (deps: VotingModuleDeps) => {
  const ballots = createBlobsBallotRepository(deps.store);
  const lists = createListReader(deps.lists);

  return {
    changeScore: makeChangeScore({ lists, ballots }),
    getMyBallot: makeGetMyBallot({ lists, ballots }),
    personalData: makeVotingPersonalData({ ballots }),
  };
};

export type VotingModule = ReturnType<typeof createVotingModule>;
