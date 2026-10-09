import type { Clock } from '../../../shared/kernel/index.ts';
import { isCommunityFresh, type Community } from '../domain/community.ts';
import type { CommunityCache, CommunityLookup } from './ports.ts';

export interface GetCommunityDeps {
  /** Null when the deployment has no invite code. */
  readonly lookup: CommunityLookup | null;
  readonly cache: CommunityCache;
  readonly clock: Clock;
  /** `COMMUNITY_NAME`, used when there is no invite or Discord can't be reached. */
  readonly fallbackName: string | null;
}

/**
 * The community's public name and icon. Refreshed daily from Discord; a failed refresh keeps
 * the last known value. Public: it is the same information an invite link shows.
 */
export const makeGetCommunity = (deps: GetCommunityDeps) => async (): Promise<Community | null> => {
  const fallback: Community | null =
    deps.fallbackName === null ? null : { name: deps.fallbackName, iconUrl: null, inviteUrl: null };
  if (deps.lookup === null) return fallback;

  const now = deps.clock.now();
  const cached = await deps.cache.get();
  if (cached !== null && isCommunityFresh(cached, now)) return cached.community;

  const fetched = await deps.lookup.lookup();
  if (!fetched.ok) return cached?.community ?? fallback;
  await deps.cache.put({ community: fetched.value, fetchedAt: now });
  return fetched.value;
};
