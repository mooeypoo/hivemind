import {
  domainError,
  err,
  ok,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { isFresh, type Leaderboard } from '../domain/leaderboard.ts';
import { strategies, type StrategyName } from '../domain/strategies.ts';
import type { LeaderboardCache, ListSource, RankingContext, ScoreSource } from './ports.ts';

export interface GetLeaderboardDeps {
  readonly lists: ListSource;
  readonly scores: ScoreSource;
  readonly cache: LeaderboardCache;
  readonly clock: Clock;
}

export type LeaderboardView =
  | { readonly hidden: true; readonly revealsAt: Date | null }
  | { readonly hidden: false; readonly minVotes: number; readonly board: Leaderboard };

const unknownStrategy = domainError(
  'invalid',
  'ranking.unknown-strategy',
  'This list uses a ranking strategy this site does not have.',
);

/**
 * A list's leaderboard. AGENTS.md: with `after-close`, no aggregate numbers leave the
 * server until voting ends (closed, or archived), for anyone. Cached until the TTL ends or an entry is added.
 */
export const makeGetLeaderboard =
  (deps: GetLeaderboardDeps) =>
  async (
    actor: Actor,
    input: { readonly list: string },
  ): Promise<Result<LeaderboardView, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const context = await deps.lists.context(input.list, member.value);
    if (!context.ok) return context;
    const now = deps.clock.now();
    const { closesAt, resultsVisibility, minVotes, votingEnded } = context.value;

    if (resultsVisibility === 'after-close' && !votingEnded) {
      return ok({ hidden: true, revealsAt: closesAt });
    }

    const cached = await deps.cache.get(context.value.listId);
    if (cached !== null && isFresh(cached, context.value.entryIds, now)) {
      return ok({ hidden: false, minVotes, board: cached });
    }
    const built = await build(deps, context.value, now);
    if (!built.ok) return built;
    await deps.cache.put(built.value);
    return ok({ hidden: false, minVotes, board: built.value });
  };

const build = async (
  deps: GetLeaderboardDeps,
  context: RankingContext,
  now: Date,
): Promise<Result<Leaderboard, DomainError>> => {
  if (!(context.strategy in strategies)) return err(unknownStrategy);
  const rank = strategies[context.strategy as StrategyName];
  const [entries, ballots] = await Promise.all([
    deps.lists.entries(context.listId),
    deps.scores.scoresForList(context.listId),
  ]);
  const items = new Map(entries.map((entry) => [entry.id, entry.item]));
  const rows = rank({
    entries: entries.map((entry) => ({ id: entry.id, title: entry.item.title })),
    ballots,
    minVotes: context.minVotes,
  }).flatMap((row) => {
    const item = items.get(row.entryId);
    return item === undefined ? [] : [{ ...row, item }];
  });
  return ok({
    listId: context.listId,
    computedAt: now,
    entryIds: entries.map((entry) => entry.id).sort(),
    rows,
  });
};
