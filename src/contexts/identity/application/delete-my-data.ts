import {
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { Clock } from '../../../shared/kernel/index.ts';
import type { ErasureRegistry, MemberRepository, PersonalDataContributor } from './ports.ts';

export interface DeleteMyDataDeps {
  readonly members: MemberRepository;
  readonly contributors: readonly PersonalDataContributor[];
  /** Null when backups aren't configured: then there is no backup to protect against. */
  readonly erasures: ErasureRegistry | null;
  readonly clock: Clock;
}

/**
 * Erases the member everywhere. The erasure is remembered first (as a fingerprint, when
 * backups exist), so no later restore can undo it. Other contexts go next; the member record
 * goes last, so a failure part-way leaves the member able to sign in and try again.
 */
export const makeDeleteMyData =
  (deps: DeleteMyDataDeps) =>
  async (actor: Actor): Promise<Result<void, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    await deps.erasures?.record(member.value.memberId, deps.clock.now());
    for (const contributor of deps.contributors) {
      const erased = await contributor.eraseFor(member.value.memberId);
      if (!erased.ok) return erased;
    }
    await deps.members.delete(member.value.memberId);
    return ok(undefined);
  };
