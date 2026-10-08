import type { MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type { Membership } from './membership.ts';

/**
 * Roles and membership are a snapshot from sign-in, so this is also the longest a Discord
 * change (a removed role, a member who left) takes to apply. Re-sign-in is silent for members
 * who already approved the app.
 */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * A signed-in member. Roles are a snapshot taken at sign-in, so a role change
 * in Discord takes effect at the next sign-in.
 */
export interface Session {
  readonly memberId: MemberId;
  readonly roleIds: readonly RoleId[];
  /** Expiry, in seconds since the epoch. */
  readonly expiresAt: number;
}

const epochSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export const issueSession = (membership: Membership, now: Date): Session => ({
  memberId: membership.member.id,
  roleIds: membership.roleIds,
  expiresAt: epochSeconds(now) + SESSION_TTL_SECONDS,
});

export const isExpired = (session: Session, now: Date): boolean =>
  epochSeconds(now) >= session.expiresAt;
