import type { MemberActor, MemberId, RoleId } from '../../../shared/kernel/index.ts';
import type { Member } from './member.ts';
import type { Session } from './session.ts';

/**
 * Who is an Admin: holders of the admin role, plus specific members by Discord user ID.
 * Either may be empty. It is evaluated on every request, so a change applies immediately.
 */
export interface AdminPolicy {
  readonly roleId: RoleId | null;
  readonly memberIds: readonly MemberId[];
}

export const isAdmin = (session: Session, policy: AdminPolicy): boolean =>
  policy.memberIds.includes(session.memberId) ||
  (policy.roleId !== null && session.roleIds.includes(policy.roleId));

/** The Actor for a valid session of a member who still exists. */
export const actorFor = (session: Session, member: Member, policy: AdminPolicy): MemberActor => ({
  kind: 'member',
  memberId: session.memberId,
  displayName: member.displayName,
  roleIds: session.roleIds,
  isAdmin: isAdmin(session, policy),
});
