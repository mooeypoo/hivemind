import {
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { MemberRepository, PersonalDataContributor } from './ports.ts';

export interface DeleteMyDataDeps {
  readonly members: MemberRepository;
  readonly contributors: readonly PersonalDataContributor[];
}

/**
 * Erases the member everywhere. Other contexts go first; the member record goes last,
 * so a failure part-way leaves the member able to sign in and try again.
 */
export const makeDeleteMyData =
  (deps: DeleteMyDataDeps) =>
  async (actor: Actor): Promise<Result<void, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    for (const contributor of deps.contributors) {
      await contributor.eraseFor(member.value.memberId);
    }
    await deps.members.delete(member.value.memberId);
    return ok(undefined);
  };
