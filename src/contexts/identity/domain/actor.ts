import type { MemberActor, RoleId } from '../../../shared/kernel/index.ts';
import type { Session } from './session.ts';

/** The Actor for a valid session. Admin is whoever holds the configured admin role. */
export const actorFor = (session: Session, adminRoleId: RoleId): MemberActor => ({
  kind: 'member',
  memberId: session.memberId,
  roleIds: session.roleIds,
  isAdmin: session.roleIds.includes(adminRoleId),
});
