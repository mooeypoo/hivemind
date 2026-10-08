import {
  ok,
  requireMember,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { loadMember } from './load-member.ts';
import type { MemberRepository, PersonalDataContributor } from './ports.ts';
import type { MyDataExport } from './views.ts';

export interface ExportMyDataDeps {
  readonly members: MemberRepository;
  readonly contributors: readonly PersonalDataContributor[];
  readonly clock: Clock;
}

export const makeExportMyData =
  (deps: ExportMyDataDeps) =>
  async (actor: Actor): Promise<Result<MyDataExport, DomainError>> => {
    const member = requireMember(actor);
    if (!member.ok) return member;
    const found = await loadMember(deps.members, member.value.memberId);
    if (!found.ok) return found;

    const sections = await Promise.all(
      deps.contributors.map(
        async (contributor) =>
          [contributor.context, await contributor.exportFor(member.value.memberId)] as const,
      ),
    );
    const { id, displayName, avatarUrl } = found.value;
    return ok({
      ...Object.fromEntries(sections),
      exportedAt: deps.clock.now().toISOString(),
      identity: { id, displayName, avatarUrl },
    });
  };
