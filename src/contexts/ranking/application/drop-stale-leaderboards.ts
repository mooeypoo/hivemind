import type { Clock } from '../../../shared/kernel/index.ts';
import type { LeaderboardCache } from './ports.ts';

export const STALE_LEADERBOARD_DAYS = 1;

/**
 * Deletes cached boards nobody has looked at for a day. They are rebuilt on demand, so this
 * loses nothing, and it means item details purged under retention terms can't linger here.
 * A scheduled job: no Actor, never reachable from a request.
 */
export const makeDropStaleLeaderboards =
  (deps: { readonly cache: LeaderboardCache; readonly clock: Clock }) =>
  async (): Promise<{ readonly dropped: number }> => {
    const cutoff = deps.clock.now().getTime() - STALE_LEADERBOARD_DAYS * 86_400_000;
    let dropped = 0;
    for (const { listId, computedAt } of await deps.cache.computedTimes()) {
      if (computedAt.getTime() <= cutoff) {
        await deps.cache.delete(listId);
        dropped += 1;
      }
    }
    return { dropped };
  };
