/** The Discord community this deployment belongs to, as shown in the UI. Public information. */
export interface Community {
  readonly name: string;
  readonly iconUrl: string | null;
  /** An invite to join the server, when the deployment configured one. */
  readonly inviteUrl: string | null;
}

export const COMMUNITY_TTL_SECONDS = 24 * 60 * 60;

export interface CachedCommunity {
  readonly community: Community;
  readonly fetchedAt: Date;
}

export const isCommunityFresh = (cached: CachedCommunity, now: Date): boolean =>
  now.getTime() - cached.fetchedAt.getTime() < COMMUNITY_TTL_SECONDS * 1000;
