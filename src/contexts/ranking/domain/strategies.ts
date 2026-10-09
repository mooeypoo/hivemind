import { bayesian, type RankedRow, type RankingInput } from './bayesian.ts';

/**
 * Every ranking strategy a list can choose. A strategy is a pure function; adding one is a
 * function plus an entry here (and the option in the list config).
 */
export const strategies = {
  bayesian,
} as const satisfies Record<string, (input: RankingInput) => RankedRow[]>;

export type StrategyName = keyof typeof strategies;
