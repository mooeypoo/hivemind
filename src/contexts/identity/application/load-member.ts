import {
  domainError,
  err,
  ok,
  type DomainError,
  type MemberId,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { Member } from '../domain/member.ts';
import type { MemberRepository } from './ports.ts';

/** A member Actor whose record is gone (erased) is treated as signed out. */
export const loadMember = async (
  members: MemberRepository,
  id: MemberId,
): Promise<Result<Member, DomainError>> => {
  const found = await members.get(id);
  return found === null
    ? err(domainError('unauthenticated', 'auth.sign-in-required', 'Sign in to continue.'))
    : ok(found.member);
};
