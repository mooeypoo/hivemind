import {
  err,
  ok,
  withConflictRetry,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { identityErrors } from '../domain/errors.ts';
import type { Member } from '../domain/member.ts';
import { issueSession, SESSION_TTL_SECONDS } from '../domain/session.ts';
import type { DiscordGateway, MemberRepository, SessionSigner } from './ports.ts';
import type { SessionGrant } from './views.ts';

export interface CompleteLoginDeps {
  readonly discord: DiscordGateway;
  readonly members: MemberRepository;
  readonly signer: SessionSigner;
  readonly clock: Clock;
}

export interface CompleteLoginInput {
  readonly code: string;
  readonly state: string;
  /** The state from the cookie set by start-login; null if the cookie is missing. */
  readonly expectedState: string | null;
}

export const makeCompleteLogin =
  (deps: CompleteLoginDeps) =>
  async (input: CompleteLoginInput): Promise<Result<SessionGrant, DomainError>> => {
    if (input.expectedState === null || input.state !== input.expectedState) {
      return err(identityErrors.invalidLoginState);
    }

    const membership = await deps.discord.verifyMembership(input.code);
    if (!membership.ok) return membership;

    // The OAuth code is single-use, so only the repository step is retried on conflict.
    const saved = await withConflictRetry(() => upsert(deps.members, membership.value.member));
    if (!saved.ok) return saved;

    const session = issueSession(membership.value, deps.clock.now());
    return ok({ token: deps.signer.sign(session), maxAgeSeconds: SESSION_TTL_SECONDS });
  };

const upsert = async (
  members: MemberRepository,
  member: Member,
): Promise<Result<void, DomainError>> => {
  const existing = await members.get(member.id);
  return members.save(member, existing?.version ?? null);
};
