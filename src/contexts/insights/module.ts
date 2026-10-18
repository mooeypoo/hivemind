import type { Clock } from '../../shared/kernel/index.ts';
import { makeGetInsights } from './application/get-insights.ts';
import {
  createListParticipation,
  createVotingParticipation,
  type ListsApi,
  type VotingApi,
} from './infrastructure/upstream.ts';

export const createInsightsModule = (deps: {
  readonly lists: ListsApi;
  readonly voting: VotingApi;
  readonly clock: Clock;
}) => ({
  getInsights: makeGetInsights({
    lists: createListParticipation(deps.lists),
    voting: createVotingParticipation(deps.voting),
    clock: deps.clock,
  }),
});
export type InsightsModule = ReturnType<typeof createInsightsModule>;
