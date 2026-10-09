import {
  domainError,
  err,
  ok,
  withConflictRetry,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import { demoMember, isDemoPersona } from '../domain/demo.ts';
import { issueSession, SESSION_TTL_SECONDS } from '../domain/session.ts';
import type { MemberRepository, SessionSigner } from './ports.ts';
import type { SessionGrant } from './views.ts';

export interface StartDemoSessionDeps {
  /** Demo mode: `DEMO_MODE=true` and not production. Off means this use case refuses. */
  readonly enabled: boolean;
  readonly members: MemberRepository;
  readonly signer: SessionSigner;
  readonly clock: Clock;
}

const demoOff = domainError(
  'forbidden',
  'identity.demo-off',
  'Demo sign-in is not available here.',
);
const unknownPersona = domainError(
  'invalid',
  'identity.unknown-persona',
  'That demo account does not exist.',
);

/** Signs in as a pretend account, without Discord. Only in demo mode. */
export const makeStartDemoSession =
  (deps: StartDemoSessionDeps) =>
  async (persona: string): Promise<Result<SessionGrant, DomainError>> => {
    if (!deps.enabled) return err(demoOff);
    if (!isDemoPersona(persona)) return err(unknownPersona);
    const member = demoMember(persona);
    const saved = await withConflictRetry(async () => {
      const existing = await deps.members.get(member.id);
      return deps.members.save(member, existing?.version ?? null);
    });
    if (!saved.ok) return saved;
    const session = issueSession({ member, roleIds: [] }, deps.clock.now());
    return ok({ token: deps.signer.sign(session), maxAgeSeconds: SESSION_TTL_SECONDS });
  };
