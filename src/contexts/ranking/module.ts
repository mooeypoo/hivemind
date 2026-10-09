import type { Store } from '@netlify/blobs';
import type { Clock } from '../../shared/kernel/index.ts';
import { makeGetLeaderboard } from './application/get-leaderboard.ts';
import { createBlobsLeaderboardCache } from './infrastructure/blobs-leaderboard-cache.ts';
import {
  createListSource,
  createScoreSource,
  type ListsApi,
  type VotingApi,
} from './infrastructure/upstream.ts';

export interface RankingModuleDeps {
  /** The `ranking` Blobs store. */
  readonly store: Store;
  readonly clock: Clock;
  /** Upstream modules' public interfaces. */
  readonly lists: ListsApi;
  readonly voting: VotingApi;
}

export const createRankingModule = (deps: RankingModuleDeps) => ({
  getLeaderboard: makeGetLeaderboard({
    lists: createListSource(deps.lists),
    scores: createScoreSource(deps.voting),
    cache: createBlobsLeaderboardCache(deps.store),
    clock: deps.clock,
  }),
});

export type RankingModule = ReturnType<typeof createRankingModule>;
