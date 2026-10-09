import type { Store } from '@netlify/blobs';
import { makeChangeScore } from './application/change-score.ts';
import { makeGetMyBallot } from './application/get-my-ballot.ts';
import { makeVotingPersonalData } from './application/personal-data.ts';
import { makeScoresForList } from './application/scores-for-list.ts';
import {
  makeExportBallots,
  makeRestoreBallots,
  type BallotSealer,
} from './application/ballot-backup.ts';
import { createBlobsBallotRepository } from './infrastructure/blobs-ballot-repository.ts';
import { createListReader, type ListsApi } from './infrastructure/lists-reader.ts';

export interface VotingModuleDeps {
  /** The `voting` Blobs store. */
  readonly store: Store;
  /** The lists module's public interface (upstream). */
  readonly lists: ListsApi;
  /** Seals ballots in backups (from `BACKUP_KEY`); null when backups are off. */
  readonly sealer: BallotSealer | null;
}

export const createVotingModule = (deps: VotingModuleDeps) => {
  const ballots = createBlobsBallotRepository(deps.store);
  const lists = createListReader(deps.lists);

  return {
    changeScore: makeChangeScore({ lists, ballots }),
    getMyBallot: makeGetMyBallot({ lists, ballots }),
    personalData: makeVotingPersonalData({ ballots }),
    // Service for ranking (downstream): anonymous scores only.
    scoresForList: makeScoresForList({ ballots }),
    /** Backup services: ballots only ever leave voting sealed. */
    exportBallots: makeExportBallots({ ballots, sealer: deps.sealer }),
    restoreBallots: makeRestoreBallots({ ballots, sealer: deps.sealer }),
  };
};

export type VotingModule = ReturnType<typeof createVotingModule>;
