import type { RoleId } from '../../../shared/kernel/index.ts';
import type { Member } from './member.ts';

/** The outcome of a successful check that someone belongs to the community's Discord server. */
export interface Membership {
  readonly member: Member;
  readonly roleIds: readonly RoleId[];
}
