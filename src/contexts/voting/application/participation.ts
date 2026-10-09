import {
  err,
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type MemberActor,
  type Result,
} from '../../../shared/kernel/index.ts';
import { votingErrors } from '../domain/errors.ts';
import type { ListReader, ListVotingRules } from './ports.ts';

/** The checks every score change starts with: a member, with a required role, on an open list. */
export const mayVote = async (
  lists: ListReader,
  actor: Actor,
  list: string,
): Promise<Result<{ member: MemberActor; rules: ListVotingRules }, DomainError>> => {
  const member = requireMember(actor);
  if (!member.ok) return member;
  const rules = await lists.rulesFor(list, member.value);
  if (!rules.ok) return rules;
  const required = rules.value.requiredRoleIds;
  if (required.length > 0 && !required.some((role) => member.value.roleIds.includes(role))) {
    return err(votingErrors.roleRequired);
  }
  if (!rules.value.isOpen) return err(votingErrors.closed);
  return ok({ member: member.value, rules: rules.value });
};
