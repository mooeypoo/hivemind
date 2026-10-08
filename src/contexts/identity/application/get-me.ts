import {
  ok,
  requireMember,
  type Actor,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { MemberRepository } from './ports.ts';
import type { MeView } from './views.ts';
import { loadMember } from './load-member.ts';

export interface GetMeDeps {
  readonly members: MemberRepository;
}

export const makeGetMe =
  (deps: GetMeDeps) =>
  async (actor: Actor): Promise<Result<MeView, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await loadMember(deps.members, member.value.memberId);
    if (!found.ok) return found;
    const { id, displayName, avatarUrl } = found.value;
    return ok({ id, displayName, avatarUrl, isAdmin: member.value.isAdmin });
  };
